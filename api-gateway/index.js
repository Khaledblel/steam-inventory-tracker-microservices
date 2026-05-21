const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const app = express();
app.use(express.json());

const loadProto = (file) => protoLoader.loadSync(path.join(__dirname, `../protos/${file}`), { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });

const inventoryProto = grpc.loadPackageDefinition(loadProto('inventory.proto')).inventory;
const pricingProto = grpc.loadPackageDefinition(loadProto('pricing.proto')).pricing;
const portfolioProto = grpc.loadPackageDefinition(loadProto('portfolio.proto')).portfolio; 

const inventoryClient = new inventoryProto.InventoryService('localhost:50051', grpc.credentials.createInsecure());
const pricingClient = new pricingProto.PricingService('localhost:50052', grpc.credentials.createInsecure());
const portfolioClient = new portfolioProto.PortfolioService('localhost:50053', grpc.credentials.createInsecure());

const getInventoryAsync = (steam_id) => new Promise((res, rej) => inventoryClient.GetUserInventory({ steam_id }, (err, data) => err ? rej(err) : res(data.items || [])));
const getPriceAsync = (market_hash_name) => new Promise((res, rej) => pricingClient.GetItemPrice({ market_hash_name }, (err, data) => err ? rej(err) : res(data)));
const getAlertsAsync = (steam_id) => new Promise((res, rej) => portfolioClient.GetPortfolio({ steam_id }, (err, data) => err ? rej(err) : res(data.alerts || []))); 
const trackItemAsync = (payload) => new Promise((res, rej) => inventoryClient.TrackItem(payload, (err, data) => err ? rej(err) : res(data)));

app.post('/api/inventory', (req, res) => inventoryClient.TrackItem(req.body, (err, response) => err ? res.status(500).json({ error: err.message }) : res.status(201).json(response)));
app.get('/api/inventory/:steam_id', (req, res) => inventoryClient.GetUserInventory({ steam_id: req.params.steam_id }, (err, response) => err ? res.status(500).json({ error: err.message }) : res.status(200).json(response)));
app.put('/api/inventory', (req, res) => inventoryClient.UpdateItem(req.body, (err, response) => err ? res.status(500).json({ error: err.message }) : res.status(200).json(response)));
app.delete('/api/inventory', (req, res) => inventoryClient.UntrackItem(req.body, (err, response) => err ? res.status(500).json({ error: err.message }) : res.status(200).json(response)));
app.get('/api/pricing/:market_hash_name', (req, res) => pricingClient.GetItemPrice({ market_hash_name: req.params.market_hash_name }, (err, response) => err ? res.status(500).json({ error: err.message }) : res.status(200).json(response)));

const schema = buildSchema(`
  type ItemPrice { market_hash_name: String!, current_price: Float!, currency: String!, last_updated: String! }
  type Alert { market_hash_name: String!, alert_type: String!, message: String! }
  
  type Portfolio {
    steam_id: String!
    total_value: Float!
    items: [ItemPrice]!
    alerts: [Alert]!  
  }

  type TrackResponse {
    success: Boolean!
    message: String!
  }

  type Query { 
    getPortfolio(steam_id: String!): Portfolio 
  }

  type Mutation {
    trackItem(steam_id: String!, market_hash_name: String!): TrackResponse
  }
`);

const root = {
    getPortfolio: async ({ steam_id }) => {
        try {
            const [items, alerts] = await Promise.all([ getInventoryAsync(steam_id), getAlertsAsync(steam_id) ]);
            const itemsWithPrices = await Promise.all(items.map(getPriceAsync));
            const total_value = itemsWithPrices.reduce((sum, item) => sum + item.current_price, 0);
            return { steam_id, total_value, items: itemsWithPrices, alerts };
        } catch (err) { throw new Error(err.message); }
    },
    
    trackItem: async ({ steam_id, market_hash_name }) => {
        try {
            console.log(`[GraphQL Mutation] Tracking item: ${market_hash_name} for ${steam_id}`);
            return await trackItemAsync({ steam_id, market_hash_name });
        } catch (err) { throw new Error(err.message); }
    }
};

app.use('/graphql', graphqlHTTP({ schema: schema, rootValue: root, graphiql: true }));
app.listen(3000, () => console.log(`API Gateway running on port 3000 (GraphQL UI: /graphql)`));