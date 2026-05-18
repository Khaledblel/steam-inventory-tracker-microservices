import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

const itemPriceSchema = {
    title: 'Steam Item Price Schema',
    version: 0,
    primaryKey: 'market_hash_name',
    type: 'object',
    properties: {
        market_hash_name: { type: 'string', maxLength: 100 },
        current_price: { type: 'number' },
        currency: { type: 'string' },
        last_updated: { type: 'string' }
    },
    required: ['market_hash_name', 'current_price', 'currency', 'last_updated']
};

let dbPromise = null;

export const getDatabase = async () => {
    if (!dbPromise) {
        console.log('⏳ Initializing RxDB (NoSQL)...');
        dbPromise = createRxDatabase({
            name: 'pricingdb',
            storage: getRxStorageMemory()
        }).then(async (db) => {
            await db.addCollections({
                prices: { schema: itemPriceSchema }
            });
            console.log('RxDB Connected and Collection Created.');
            return db;
        });
    }
    return dbPromise;
};

export const upsertPrice = async (itemName, price, currency) => {
    const db = await getDatabase();
    const timestamp = new Date().toISOString();
    
    await db.prices.upsert({
        market_hash_name: itemName,
        current_price: price,
        currency: currency,
        last_updated: timestamp
    });
    console.log(`[RxDB] Saved ${itemName} -> ${price} ${currency}`);
};

export const getPrice = async (itemName) => {
    const db = await getDatabase();
    const doc = await db.prices.findOne({
        selector: { market_hash_name: itemName }
    }).exec();
    return doc ? doc.toJSON() : null;
};