const mongoose = require("mongoose");

class Database {
  constructor() {
    this.uri = process.env.MONGODB_URI;
    if (!this.uri) {
      console.error("MONGODB_URI environment variable is not defined.");
    }
  }

  async connect() {
    try {
      await mongoose.connect(this.uri);
      console.log("Connected to MongoDB Atlas");
    } catch (error) {
      console.error("Error connecting to MongoDB:", error);
      throw error;
    }
  }

  async close() {
    try {
      await mongoose.connection.close();
      console.log("MongoDB connection closed");
    } catch (error) {
      console.error("Error closing MongoDB connection:", error);
    }
  }
}

module.exports = Database;
