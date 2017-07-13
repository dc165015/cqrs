import * as io from "socket.io-client";
import { EventEmitter } from "events";
import Event from "./Event";
const uid = require("uuid").v1;

export default class DomainProxy extends EventEmitter {

    private socket: SocketIOClient.Socket;
    private socketMap: {};
    private _connected: boolean;
    public domainMap = new Map();
    private initialized: boolean = false;

    constructor(public readonly entryURL: string, private entryDomainId: string, public readonly domainId: string) {
        super();
        const entrySocket = this.connect(entryURL);
        this.socketMap[entryDomainId] = entrySocket;
        this.init(entrySocket);
        this.once("initialized", () => {
            for (let [{ url, id }] of this.domainMap) {
                this.socketMap[id] = this.connect(url);
            }
        });
    }

    private connect(url) {

        const that = this;
        const socket = typeof url === "string" ? io(url) : url;

        socket.on("connect", () => {
            this._connected = true;
            this.emit("connected");
        });

        socket.on("getDomainId", function (callback) {
            callback(that.domainId);
        })

        socket.on("connect_error", function () {
            console.log(arguments);
        });

        // socket.on("remove", function (actorId) {
        //     for (let [k, idset] of that.domainMap) {
        //         idset.delete(actorId);
        //     }
        // });

        // socket.on("add", function (domainId: string, actorId) {
        //     for (let [k, idset] of that.domainMap) {
        //         if (k.id === domainId) {
        //             idset.add(actorId);
        //             return;
        //         }
        //     }
        // });

        socket.on("event", function (event) {
            that.emit("event", Event.parse(event));
        })

        return socket;
    }

    private init(socket) {
        if (this.initialized) {
            return;
        }
        socket.emit("getActorIds", async (dais) => {
            await this.refresh(socket);
            this.initialized = true;
            this.emit("initialized");
        })
    }

    public async refresh(socket) {
        return new Promise(resolve => {
            socket.emit("getActorIds", (dais) => {
                this.domainMap = new Map();
                for (let o of dais) {
                    const ids = new Set(o.ids);
                    this.domainMap.set(o.domain, ids);
                    resolve();
                }
            })
        })
    }

    getDomainInfoByActorId(actorId) {
        for (let [domainInfo, idset] of this.domainMap) {
            let exist = idset.has(actorId);
            return domainInfo;
        }
    }

    addSocket(domainId, socket) {
        this.socketMap[domainId] = this.connect(socket);
    }

    has(actorId) {
        return !!this.getDomainInfoByActorId(actorId);
    }

    get connected(): boolean {
        return this._connected;
    }

    async getActor(type, id) {
        const that = this;
        return new Promise(function (resolve, reject) {
            that.socket.emit("getActor", type, id, function (actorInfo) {
                if (actorInfo) {
                    resolve(new Proxy(null, {

                        get(target, prop) {
                            if (prop === "json") {
                                return actorInfo;
                            } else if (prop === "refresh") {
                                return new Promise(function () {
                                    that.socket.emit("getActor", type, id, function (_actorInfo) {
                                        actorInfo = _actorInfo;
                                        resolve(actorInfo);
                                    });
                                })
                            } else {
                                return new Proxy(null, {
                                    apply(target, cxt, args) {
                                        return new Promise(function () {
                                            that.socket.emit("call", type, id, prop, args, function (err, result) {
                                                if (err) {
                                                    reject(err);
                                                } else {
                                                    resolve(result);
                                                }
                                            })
                                        })
                                    }
                                })
                            }
                        }

                    }));
                } else {
                    resolve(null);
                }
            })
        })
    }
}
