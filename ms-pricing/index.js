import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase, upsertPrice, getPrice } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, '../protos/pricing.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});
const pricingProto = grpc.loadPackageDefinition(packageDefinition).pricing;

// gRPC Method: GetItemPrice
async function getItemPrice(call, callback) {
    const { market_hash_name } = call.request;
    console.log(`[gRPC] Fetching price for: ${market_hash_name}`);
    
    try {
        const priceData = await getPrice(market_hash_name);
        if (priceData) {
            callback(null, priceData);
        } else {
            callback(null, {
                market_hash_name: market_hash_name,
                current_price: 0,
                currency: "EUR",
                last_updated: "Never"
            });
        }
    } catch (err) {
        console.error(err);
        callback(err, null);
    }
}

async function main() {
    await getDatabase();
    await upsertPrice("AK-47 | Redline (Field-Tested)", 20.50, "EUR");
    await upsertPrice("AWP | Asiimov (Field-Tested)", 95.00, "EUR");

    // Start gRPC Server
    const server = new grpc.Server();
    server.addService(pricingProto.PricingService.service, {
        GetItemPrice: getItemPrice
    });

    const PORT = '50052';
    server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) return console.error(err);
        console.log(`ms-pricing listening on gRPC port ${port}`);
    });
}

main();