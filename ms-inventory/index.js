const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { trackItemInDb, getUserItemsFromDb } = require('./db'); 

const PROTO_PATH = path.join(__dirname, '../protos/inventory.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});
const inventoryProto = grpc.loadPackageDefinition(packageDefinition).inventory;

// gRPC Method: TrackItem
async function trackItem(call, callback) {
    const { steam_id, market_hash_name } = call.request;
    console.log(`[gRPC] Request to track: ${market_hash_name} for user: ${steam_id}`);
    
    try {
        await trackItemInDb(steam_id, market_hash_name);
        callback(null, { 
            success: true, 
            message: `Successfully tracking ${market_hash_name} in DB!` 
        });
    } catch (err) {
        console.error(err);
        callback(err, null);
    }
}

// gRPC Method: GetUserInventory
async function getUserInventory(call, callback) {
    const { steam_id } = call.request;
    console.log(`[gRPC] Fetching inventory from DB for user: ${steam_id}`);
    
    try {
        const items = await getUserItemsFromDb(steam_id);
        callback(null, { 
            steam_id: steam_id, 
            items: items
        });
    } catch (err) {
        console.error(err);
        callback(err, null);
    }
}

function main() {
    const server = new grpc.Server();
    server.addService(inventoryProto.InventoryService.service, {
        TrackItem: trackItem,
        GetUserInventory: getUserInventory
    });

    const PORT = '50051';
    server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) return console.error(err);
        console.log(`ms-inventory listening on gRPC port ${port}`);
    });
}

main();