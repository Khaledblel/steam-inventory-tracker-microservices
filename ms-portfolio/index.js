const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { getUserAlertsFromDb } = require('./db');

const PROTO_PATH = path.join(__dirname, '../protos/portfolio.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});
const portfolioProto = grpc.loadPackageDefinition(packageDefinition).portfolio;

async function getPortfolio(call, callback) {
    const { steam_id } = call.request;
    console.log(`[gRPC Portfolio] Fetching alerts for user: ${steam_id}`);
    
    try {
        const dbAlerts = await getUserAlertsFromDb(steam_id);
        
        const formattedAlerts = dbAlerts.map(row => ({
            market_hash_name: row.market_hash_name,
            alert_type: "PRICE_DROP",
            message: row.alert_message
        }));

        callback(null, { 
            steam_id: steam_id, 
            total_net_worth: 0,
            alerts: formattedAlerts 
        });
    } catch (err) {
        callback(err, null);
    }
}

function main() {
    const server = new grpc.Server();
    server.addService(portfolioProto.PortfolioService.service, {
        GetPortfolio: getPortfolio
    });

    const PORT = '50053';
    server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) return console.error(err);
        console.log(`ms-portfolio listening on gRPC port ${port}`);
        server.start();
    });
}
main();