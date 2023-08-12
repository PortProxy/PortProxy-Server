import WebSocket from "ws";
import { ObjectSchema, validateObject } from "./utils";
import Session, { getSession } from "./session";

export type SocketType = "host-data" | "host-control" | "client" | "undecided";

export type NodePacketId = (
    "connection_type" |
    "keep_alive"
);

export type ServerPacketId = (
    "session_details" |
    "new_client" |
    "client_connected" |
    "keep_alive"
);

type Listener = {
    callback: (packet: any) => Promise<void>
    schema: ObjectSchema
}

export default class Socket {
    public readonly type: SocketType = "undecided";
    private listeners = new Map<NodePacketId | "close", Listener[]>();
    private terminated = false;

    constructor(
        private readonly internal: WebSocket,
        public readonly id: string,
        path: string
    ) {
        const parts = path.substring(1).split("/");
        if (!parts.length) {
            this.close();
            return;
        }

        this.internal.addEventListener("close", () => this.close());

        if (parts[0] == "host") {
            if (parts.length == 1) {
                this.type = "host-control";
                new Session(this);
            } else if (parts.length == 4) {
                const sessionId = parts[1];
                const dataKey = parts[2];
                const clientId = parts[3];
                this.type = "host-data";

                const session = getSession(sessionId);
                if (!session || session.getDataKey() != dataKey) {
                    this.close();
                    return;
                }
                session.addDataSocket(clientId, this);
            }
        } else if (parts[0] == "client" && parts.length == 2) {
            this.type = "client";
            const sessionId = parts[1];

            const session = getSession(sessionId);
            if (!session) {
                this.close();
                return;
            }
            session.addClient(this);
        } else {
            console.error(`Socket connected at path '${path}' which is invalid.`);
            this.close();
            return;
        }

        if (this.type == "host-control") {
            this.internal.addListener("message", raw => {
                try {
                    const message = JSON.parse(raw.toString("utf-8"));
                    validateObject(message, {
                        packetId: "string"
                    });
                    const packetId = message.packetId as string;

                    const listeners = this.listeners.get(packetId as NodePacketId);
                    if (listeners) {
                        listeners.forEach(async listener => {
                            try {
                                const validated = validateObject(message, listener.schema);
                                await listener.callback(validated);
                            } catch {}
                        });
                    }
                } catch (e) {
                    console.error(e);
                }
            });

            this.on("keep_alive", async () => {
                this.send("keep_alive");
            }, {});
        }
    }

    public on(packetId: NodePacketId | "close", callback: (packet: any) => Promise<void>, schema: ObjectSchema) {
        const existingListeners = this.listeners.get(packetId);
        const listener: Listener = { callback, schema };

        if (existingListeners) {
            existingListeners.push(listener);
        } else {
            this.listeners.set(packetId, [listener]);
        }

        return () => {
            const existingListeners = this.listeners.get(packetId);
            if (existingListeners) {
                const index = existingListeners.indexOf(listener);
                if (index >= 0) {
                    existingListeners.splice(index, 1);
                }
                if (!existingListeners.length) {
                    this.listeners.delete(packetId);
                }
            }
        }
    }

    public send(packetId: ServerPacketId, message?: Object) {
        if ((message as any)?.packetId !== undefined) {
            throw "Attempted to send a message to socket that contains a packet id.";
        }
        this.internal.send(JSON.stringify({
            packetId,
            ...message
        }, null, 2));
    }

    public close() {
        if (!this.terminated) {
            this.terminated = true;
            const listeners = this.listeners.get("close");
            for (let callback of listeners || []) {
                callback.callback(null);
            }
        }
        if (this.internal.readyState != this.internal.CLOSED && this.internal.readyState != this.internal.CLOSING) {
            this.internal.close();
        }
        this.listeners.clear();
    }

    public link(socket: Socket) {
        socket.internal.on("message", raw => {
            this.internal.send(raw);
        });

        this.internal.on("message", raw => {
            socket.internal.send(raw);
        });

        for (let end of [socket, this]) {
            if (end.type == "client") {
                end.send("client_connected");
            }
        }
    }
}