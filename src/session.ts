import Socket from "./socket";
import { generateRandomString } from "./utils";

const sessions = new Map<string, Session>();

export function getAvailableSessionId() {
    let id: string;
    let attempts = 0;
    do {
        id = generateRandomString(Math.floor(attempts++ / 5) + 60);
    } while (sessions.has(id));
    return id;
}

// export function getSessionByDataKey(key: string) {
//     for (let session of sessions.values()) {
//         if (session.getDataKey() == key) {
//             return session;
//         }
//     }
//     return null;
// }

export function getSession(id: string) {
    return sessions.get(id) || null;
}

export interface Connection {
    client: Socket
    host: Socket
}


export default class Session {
    private readonly id: string;
    private terminated = false;
    private dataKey!: string;
    private readonly pendingClients = new Map<string, Socket>();
    private readonly clients = new Map<string, Connection>();
    // private dataSocket: Socket | null = null;

    constructor(
        private readonly host: Socket
    ) {
        this.id = getAvailableSessionId();
        sessions.set(this.id, this);
        console.log(`Created session '${this.id}'`);

        this.generateDataKey();

        this.host.send("session_details", {
            id: this.id,
            key: this.dataKey
        });

        // this.host.send("host_data_key", {
        //     key: this.dataKey
        // });
    }

    private generateDataKey() {
        this.dataKey = generateRandomString(300);
    }

    public getDataKey() {
        return this.dataKey;
    }

    // public attachDataSocket(dataSocket: Socket) {
    //     if (this.dataSocket) {
    //         this.dataSocket.close();
    //     }
    //     this.dataSocket = dataSocket;
    // }

    public addClient(client: Socket) {
        this.pendingClients.set(client.id, client);
        this.host.send("new_client", {
            id: client.id
        });

        client.on("close", async () => {
            this.pendingClients.delete(client.id);
            const connection = this.clients.get(client.id);
            if (connection) {
                connection.host.close();
                connection.client.close();
                this.clients.delete(client.id);
            }
        }, {});
    }

    public addDataSocket(clientId: string, dataSocket: Socket) { // dataSocket = connection to host
        const client = this.pendingClients.get(clientId); // connection to client
        if (!client) {
            return dataSocket.close();
        }
        this.pendingClients.delete(clientId);
        this.clients.set(clientId, {
            client,
            host: dataSocket
        });
        dataSocket.link(client);

        dataSocket.on("close", async () => {
            const connection = this.clients.get(clientId);
            if (connection) {
                connection.host.close();
                connection.client.close();
                this.clients.delete(clientId);
            }
        }, {});
    }
}