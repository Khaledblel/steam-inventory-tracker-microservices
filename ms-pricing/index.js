import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase, upsertPrice, getPrice } from './db.js';
import { Kafka } from 'kafkajs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, '../protos/pricing.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});
const pricingProto = grpc.loadPackageDefinition(packageDefinition).pricing;

const kafka = new Kafka({
    clientId: 'pricing-service',
    brokers: ['localhost:29092']
});
const consumer = kafka.consumer({ groupId: 'pricing-group' });

async function getItemPrice(call, callback) {
    const { market_hash_name } = call.request;
    try {
        const priceData = await getPrice(market_hash_name);
        if (priceData) {
            callback(null, priceData);
        } else {
            callback(null, { market_hash_name, current_price: 0, currency: "EUR", last_updated: "Never" });
        }
    } catch (err) { callback(err, null); }
}

async function startKafkaConsumer() {
    await consumer.connect();
    console.log(`Kafka Consumer connected.`);
    
    await consumer.subscribe({ topic: 'item-tracked', fromBeginning: true });
    
    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            const eventData = JSON.parse(message.value.toString());
            console.log(`[Kafka Consumer] Received event on '${topic}': User ${eventData.steam_id} tracked ${eventData.market_hash_name}`);
            

            const mockSimulatedPrice = Math.floor(Math.random() * 100) + 10; 
            await upsertPrice(eventData.market_hash_name, mockSimulatedPrice, "EUR");
            console.log(`[Pricing Service] Asynchronously fetched and saved price for ${eventData.market_hash_name} -> ${mockSimulatedPrice} EUR`);
        },
    });
}

async function main() {
    await getDatabase();
    await upsertPrice("AK-47 | Redline (Field-Tested)", 20.50, "EUR");
    await upsertPrice("AWP | Asiimov (Field-Tested)", 95.00, "EUR");

    await startKafkaConsumer();

    const server = new grpc.Server();
    server.addService(pricingProto.PricingService.service, {
        GetItemPrice: getItemPrice
    });

    server.bindAsync(`0.0.0.0:50052`, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) return console.error(err);
        console.log(`ms-pricing listening on gRPC port ${port}`);
        server.start();
    });
}
main();