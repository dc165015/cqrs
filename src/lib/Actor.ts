import Event from "./Event";
import Service from "./Service";
import LockDataType from "./types/LockDataType";
const uncommittedEvents = Symbol.for('uncommittedEvents');
const loadEvents = Symbol.for('loadEvents');
const uuid = require('uuid').v1;
const setdata = Symbol.for("setdata");

export class Actor {

    private data: any;

    private latestLockTime: Date;

    // framework provider 
    private service: Service;

    constructor(data = {}) {
        this[uncommittedEvents] = [];
        this.data = data;
        this.data.isAlive = true;
        if (!this.data.id) {
            this.data.id = uuid();
        }
    }

    get type(): string {
        return Actor.getType();
    }

    get version() {
        return Actor.version
    }

    [loadEvents](events: Event[]) {
        events.forEach(event => {
            this.when(event);
        });
    }

    set [setdata](data) {
        this.data = data;
    }

    remove(args) {
        this.service.apply('remove');
    }

    get id() {
        return this.json.id;
    }

    static getType(): string {
        return this.name;
    }

    get json() {
        let data = Actor.toJSON(this);
        Object.freeze(data);
        return data;
    }

    lock(data: LockDataType) {
        if (this.data.key === data.key) {
            return true;
        }
        if (this.data.isLock && Date.now() - this.latestLockTime.getTime() < this.data.timeout) {
            return false
        } else {
            if (!data.timeout) {
                data.timeout = 2000
            }
            this.service.apply("lock", data.key);
            this.latestLockTime = new Date();
            return true;
        }
    }

    unlock(key) {
        if (this.data.key === key) {
            this.service.apply("unlock", key);
        }
    }

    relock(key) {
        this.service.apply("unlock", key);
    }

    when(event: Event) {
        switch (event.type) {
            case 'remove':
                return Object.assign({}, this.data, { isAlive: false });
            case 'lock':
                return Object.assign({}, this.data,
                    { isLock: true, key: event.data.key, timeout: event.data.timeout });
            case 'unlock':
                return Object.assign({}, this.data, { isLock: false, key: event.data });
        }
    }

    static toJSON(actor: Actor) {
        return JSON.parse(JSON.stringify(actor.data));
    }

    static parse(json) {
        return new Actor(json);
    }

    static get version() {
        return "1.0";
    }
}

export interface ActorConstructor {
    new (any): Actor
    getType(): string
    version: string,
    createBefor?: (any) => Promise<any>
}