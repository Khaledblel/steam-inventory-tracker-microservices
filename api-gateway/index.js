const express = require('express');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const app = express();
app.use(express.json()); 

const loadProto = (filename) => {
    const PROTO_PATH = path.join(__dirname, `../protos/${filename}`);
    return protoLoader.loadSync(PROTO_PATH, {
        keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
    });
};

const inventoryProto = grpc.loadPackageDefinition(loadProto('inventory.proto')).inventory;
const pricingProto = grpc.loadPackageDefinition(loadProto('pricing.proto')).pricing;

const inventoryClient = new inventoryProto.InventoryService('localhost:50051', grpc.credentials.createInsecure());
const pricingClient = new pricingProto.PricingService('localhost:50052', grpc.credentials.createInsecure());

app.post('/api/inventory', (req, res) => {
    const { steam_id, market_hash_name } = req.body;
    console.log(`[REST] POST /api/inventory -> Forwarding to gRPC ms-inventory`);
    
    inventoryClient.TrackItem({ steam_id, market_hash_name }, (err, response) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json(response);
    });
});

app.get('/api/inventory/:steam_id', (req, res) => {
    const steam_id = req.params.steam_id;
    console.log(`[REST] GET /api/inventory/${steam_id} -> Forwarding to gRPC ms-inventory`);
    
    inventoryClient.GetUserInventory({ steam_id }, (err, response) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json(response);
    });
});

app.get('/api/pricing/:market_hash_name', (req, res) => {
    const market_hash_name = req.params.market_hash_name;
    console.log(`[REST] GET /api/pricing/${market_hash_name} -> Forwarding to gRPC ms-pricing`);
    
    pricingClient.GetItemPrice({ market_hash_name }, (err, response) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json(response);
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`API Gateway is running on http://localhost:${PORT}`);
    console.log(`   - REST APIs available at /api/inventory and /api/pricing`);
});