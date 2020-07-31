// Universal data for client AND server side in here
export class Database {
    save_data: Buffer = Buffer.alloc(0x70);
    star_count = 0;
}

// Client only data here
export class DatabaseClient extends Database { }

// Server only data here
export class DatabaseServer extends Database {
    // Puppets
    playerInstances: any = {};
    players: any = {};
}