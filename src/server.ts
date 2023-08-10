import { WebSocketServer } from "ws";
import Socket from "./socket";
import { generateRandomString } from "./utils";


let wss: WebSocketServer | undefined;


export function isRunning() {
    return !!wss;
}


const sockets = new Map<string, Socket>();


export function start(port: number) {
    if (isRunning()) {
        throw "WebSocket server is already running.";
    }
    wss = new WebSocketServer({
        port
    });

    wss.on("listening", () => {
        console.log(`Started WebSocket server on 0.0.0.0:${port}.`);
    });

    wss.on("error", e => {
        console.log("WebSocket server encountered an error:", e);
    });

    wss.on("close", () => {
        console.log("Stopped WebSocket server.")
    });

    wss.on("connection", (internal, req) => {
        const socket = new Socket(internal, getAvailableClientId(), req.url || "");
        sockets.set(socket.id, socket);

        let timeout: ReturnType<typeof setTimeout>;

        function prepareRemoval() {
            if (timeout) {
                clearTimeout(timeout);
            }

            timeout = setTimeout(() => {
                sockets.delete(socket.id);
            }, 600_000); // 10 minutes
        }

        internal.addListener("close", prepareRemoval);
        socket.on("close", async () => prepareRemoval(), {});
    });
}


export function stop() {
    if (!isRunning()) {
        throw "WebSocket server is not running.";
    }
    wss!.close();
}


export function getAvailableClientId() {
    let id: string;
    let attempts = 0;
    do {
        id = generateRandomString(Math.floor(attempts++ / 5) + 60);
    } while (sockets.has(id));
    return id;
}