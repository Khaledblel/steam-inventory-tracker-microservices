import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase, upsertPrice, getPrice } from './db.js';
import { Kafka } from 'kafkajs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROTO_PATH = path.join(__dirname, '../protos/pricing.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const pricingProto = grpc.loadPackageDefinition(packageDefinition).pricing;

const kafka = new Kafka({ clientId: 'pricing-service', brokers: ['localhost:29092'] });
const consumer = kafka.consumer({ groupId: 'pricing-group' });
const producer = kafka.producer();

async function getItemPrice(call, callback) {
    const { market_hash_name } = call.request;
    try {
        const priceData = await getPrice(market_hash_name);
        callback(null, priceData ? priceData : { market_hash_name, current_price: 0, currency: "EUR", last_updated: "Never" });
    } catch (err) { callback(err, null); }
}

async function startKafka() {
    await producer.connect(); 
    await consumer.connect();
    console.log(`Kafka Consumer & Producer connected to Pricing.`);
    
    await consumer.subscribe({ topic: 'item-tracked', fromBeginning: true });
    
    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            const eventData = JSON.parse(message.value.toString());
            const mockSimulatedPrice = Math.floor(Math.random() * 100) + 10;
            
            await upsertPrice(eventData.market_hash_name, mockSimulatedPrice, "EUR");
            console.log(`[Pricing Service] Saved price for ${eventData.market_hash_name} -> ${mockSimulatedPrice} EUR`);

            await producer.send({
                topic: 'price-updated',
                messages: [{ value: JSON.stringify({ market_hash_name: eventData.market_hash_name, price: mockSimulatedPrice }) }]
            });
        },
    });
}

async function main() {
    await getDatabase();
    await startKafka();

    const server = new grpc.Server();
    server.addService(pricingProto.PricingService.service, { GetItemPrice: getItemPrice });

    server.bindAsync(`0.0.0.0:50052`, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) return console.error(err);
        console.log(`ms-pricing listening on gRPC port ${port}`);
    });
}
main();