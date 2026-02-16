import mongoose from "mongoose";

// Safe DB connection logic for serverless
// Safe DB connection logic for serverless
let cached = (global as any).mongoose;

if (!cached) {
    cached = (global as any).mongoose = { conn: null, promise: null };
}

async function dbConnect() {
    if (cached.conn) {
        return cached.conn;
    }

    const uri = process.env.MONGO_URI;
    if (!uri) {
        throw new Error("MONGO_URI environment variable is not defined");
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 10000,
        };

        cached.promise = mongoose.connect(uri, opts).then((mongoose) => {
            return mongoose;
        });
    }
    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

export default dbConnect;
