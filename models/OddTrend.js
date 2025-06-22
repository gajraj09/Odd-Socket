const mongoose = require('mongoose');

const trendSchema = new mongoose.Schema({
    date: { type: String, required: true },
    trend: { type: String, required: false }, // Ensure this is required
    trend2: { type: String, required: false } // Optional field
});

module.exports = mongoose.model('OddTrend', trendSchema);
