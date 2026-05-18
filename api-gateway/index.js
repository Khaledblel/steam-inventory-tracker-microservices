const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
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

const getInventoryAsync = (steam_id) => {
    return new Promise((resolve, reject) => {
        inventoryClient.GetUserInventory({ steam_id }, (err, response) => {
            if (err) reject(err);
            else resolve(response.items || []);
        });
    });
};

const getPriceAsync = (market_hash_name) => {
    return new Promise((resolve, reject) => {
        pricingClient.GetItemPrice({ market_hash_name }, (err, response) => {
            if (err) reject(err);
            else resolve(response);
        });
    });
};

app.post('/api/inventory', (req, res) => {
    inventoryClient.TrackItem(req.body, (err, response) => {
        if (err) return res.status(500).json({ error: err.message }); res.status(201).json(response);
    });
});
app.get('/api/inventory/:steam_id', (req, res) => {
    inventoryClient.GetUserInventory({ steam_id: req.params.steam_id }, (err, response) => {
        if (err) return res.status(500).json({ error: err.message }); res.status(200).json(response);
    });
});
app.put('/api/inventory', (req, res) => {
    inventoryClient.UpdateItem(req.body, (err, response) => {
        if (err) return res.status(500).json({ error: err.message }); res.status(200).json(response);
    });
});
app.delete('/api/inventory', (req, res) => {
    inventoryClient.UntrackItem(req.body, (err, response) => {
        if (err) return res.status(500).json({ error: err.message }); res.status(200).json(response);
    });
});
app.get('/api/pricing/:market_hash_name', (req, res) => {
    pricingClient.GetItemPrice({ market_hash_name: req.params.market_hash_name }, (err, response) => {
        if (err) return res.status(500).json({ error: err.message }); res.status(200).json(response);
    });
});

const schema = buildSchema(`
  type ItemPrice {
    market_hash_name: String!
    current_price: Float!
    currency: String!
    last_updated: String!
  }

  type Portfolio {
    steam_id: String!
    total_value: Float!
    items: [ItemPrice]!
  }

  type Query {
    getPortfolio(steam_id: String!): Portfolio
  }
`);

const root = {
    getPortfolio: async ({ steam_id }) => {
        console.log(`[GraphQL] Fetching complex portfolio for: ${steam_id}`);
        try {
            const items = await getInventoryAsync(steam_id);
            
            const pricePromises = items.map(itemName => getPriceAsync(itemName));
            const itemsWithPrices = await Promise.all(pricePromises);
            
            const total_value = itemsWithPrices.reduce((sum, item) => sum + item.current_price, 0);

            return {
                steam_id: steam_id,
                total_value: total_value,
                items: itemsWithPrices
            };
        } catch (err) {
            throw new Error("Failed to fetch portfolio: " + err.message);
        }
    }
};

app.use('/graphql', graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true 
}));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`API Gateway running on http://localhost:${PORT}`);
    console.log(`   - REST: /api/inventory | /api/pricing`);
    console.log(`   - GraphQL UI: http://localhost:${PORT}/graphql`);
});