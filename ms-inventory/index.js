const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { trackItemInDb, getUserItemsFromDb, updateItemInDb, deleteItemFromDb } = require('./db');
const { Kafka } = require('kafkajs'); 

const PROTO_PATH = path.join(__dirname, '../protos/inventory.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});
const inventoryProto = grpc.loadPackageDefinition(packageDefinition).inventory;

const kafka = new Kafka({
    clientId: 'inventory-service',
    brokers: ['localhost:29092'] 
});
const producer = kafka.producer();

async function trackItem(call, callback) {
    const { steam_id, market_hash_name } = call.request;
    try {
        await trackItemInDb(steam_id, market_hash_name);
        
        const eventMessage = JSON.stringify({ steam_id, market_hash_name, timestamp: new Date() });
        await producer.send({
            topic: 'item-tracked',
            messages: [{ value: eventMessage }]
        });
        console.log(`[Kafka Producer] Sent event to topic 'item-tracked': ${market_hash_name}`);

        callback(null, { success: true, message: `Successfully tracking ${market_hash_name}!` });
    } catch (err) { callback(err, null); }
}

async function getUserInventory(call, callback) {
    const { steam_id } = call.request;
    try {
        const items = await getUserItemsFromDb(steam_id);
        callback(null, { steam_id, items });
    } catch (err) { callback(err, null); }
}

async function updateItem(call, callback) {
    const { steam_id, old_market_hash_name, new_market_hash_name } = call.request;
    try {
        const changes = await updateItemInDb(steam_id, old_market_hash_name, new_market_hash_name);
        if (changes > 0) callback(null, { success: true, message: `Updated to ${new_market_hash_name}` });
        else callback(null, { success: false, message: `Item not found.` });
    } catch (err) { callback(err, null); }
}

async function untrackItem(call, callback) {
    const { steam_id, market_hash_name } = call.request;
    try {
        const changes = await deleteItemFromDb(steam_id, market_hash_name);
        if (changes > 0) callback(null, { success: true, message: `Stopped tracking ${market_hash_name}` });
        else callback(null, { success: false, message: `Item not found.` });
    } catch (err) { callback(err, null); }
}

async function main() {
    await producer.connect(); 
    console.log(`Kafka Producer connected.`);

    const server = new grpc.Server();
    server.addService(inventoryProto.InventoryService.service, {
        TrackItem: trackItem, GetUserInventory: getUserInventory, UpdateItem: updateItem, UntrackItem: untrackItem
    });

    server.bindAsync(`0.0.0.0:50051`, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) return console.error(err);
        console.log(`ms-inventory listening on gRPC port ${port}`);
        server.start();
    });
}
main();