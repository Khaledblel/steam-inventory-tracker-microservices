const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { getUserAlertsFromDb } = require('./db');
const { Kafka } = require('kafkajs'); 

const PROTO_PATH = path.join(__dirname, '../protos/portfolio.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const portfolioProto = grpc.loadPackageDefinition(packageDefinition).portfolio;

const kafka = new Kafka({ clientId: 'portfolio-service', brokers: ['localhost:29092'] });
const consumer = kafka.consumer({ groupId: 'portfolio-group' });

async function sendDiscordWebhook(content) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
        console.log(`Discord Webhook URL is missing in .env (DISCORD_WEBHOOK_URL)`);
        return;
    }

    const payload = {
        content: content,
        username: "Steam Portfolio Bot",
        avatar_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/3840px-Steam_icon_logo.svg.png"
    };

    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log(`[Discord] Webhook sent successfully!`);
    } catch (err) {
        console.error(`[Discord] Failed to send webhook:`, err.message);
    }
}

async function getPortfolio(call, callback) {
    const { steam_id } = call.request;
    try {
        const dbAlerts = await getUserAlertsFromDb(steam_id);
        const formattedAlerts = dbAlerts.map(row => ({
            market_hash_name: row.market_hash_name, alert_type: "PRICE_DROP", message: row.alert_message
        }));
        callback(null, { steam_id, total_net_worth: 0, alerts: formattedAlerts });
    } catch (err) { callback(err, null); }
}

async function startKafkaConsumer() {
    await consumer.connect();
    console.log(`Kafka Consumer connected to Portfolio.`);
    
    await consumer.subscribe({ topics: ['item-tracked', 'item-updated', 'item-untracked', 'price-updated'], fromBeginning: false });
    
    await consumer.run({
        eachMessage: async ({ topic, message }) => {
            const eventData = JSON.parse(message.value.toString());
            console.log(`[Kafka Consumer] Received event on topic: ${topic}`);
            
            let discordMessage = "";

            switch (topic) {
                case 'item-tracked':
                    discordMessage = `➕ **New Item Tracked:** User \`${eventData.steam_id}\` started tracking **${eventData.market_hash_name}**!`;
                    break;
                case 'item-updated':
                    discordMessage = `🔄 **Item Updated:** User \`${eventData.steam_id}\` swapped tracking from **${eventData.old_market_hash_name}** to **${eventData.new_market_hash_name}**!`;
                    break;
                case 'item-untracked':
                    discordMessage = `➖ **Item Untracked:** User \`${eventData.steam_id}\` stopped tracking **${eventData.market_hash_name}**!`;
                    break;
                case 'price-updated':
                    discordMessage = `🚨 **Market Price Update:** **${eventData.market_hash_name}** is now **${eventData.price} EUR**! 📈`;
                    break;
            }

            if (discordMessage !== "") {
                await sendDiscordWebhook(discordMessage);
            }
        }
    });
}

async function main() {
    await startKafkaConsumer(); 

    const server = new grpc.Server();
    server.addService(portfolioProto.PortfolioService.service, { GetPortfolio: getPortfolio });

    server.bindAsync(`0.0.0.0:50053`, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) return console.error(err);
        console.log(`ms-portfolio listening on gRPC port ${port}`);
        server.start();
    });
}
main();