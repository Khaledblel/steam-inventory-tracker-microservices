const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../protos/inventory.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});
const inventoryProto = grpc.loadPackageDefinition(packageDefinition).inventory;

function trackItem(call, callback) {
    console.log(`[gRPC] Received request to track: ${call.request.market_hash_name} for user: ${call.request.steam_id}`);
    
    // mock response. Later, will save this to SQLite
    callback(null, { 
        success: true, 
        message: `Successfully started tracking ${call.request.market_hash_name}` 
    });
}

function getUserInventory(call, callback) {
    console.log(`[gRPC] Fetching inventory for user: ${call.request.steam_id}`);
    
    // Mock response
    callback(null, { 
        steam_id: call.request.steam_id, 
        items: ["AK-47 | Redline (Field-Tested)", "AWP | Asiimov (Field-Tested)"] 
    });
}

function main() {
    const server = new grpc.Server();
    server.addService(inventoryProto.InventoryService.service, {
        TrackItem: trackItem,
        GetUserInventory: getUserInventory
    });

    const PORT = '50051';
    server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log(`ms-inventory is running on gRPC port ${port}`);
    });
}

main();