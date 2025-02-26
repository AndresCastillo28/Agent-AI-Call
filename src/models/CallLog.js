// models/callLog.js
import mongoose from 'mongoose';

const transcriptSchema = new mongoose.Schema({
  role: String,      // 'user' o 'assistant'
  text: String,
  timestamp: Date
});

const callEventSchema = new mongoose.Schema({}, { strict: false });
// Usamos { strict: false } para poder almacenar cualquier estructura de evento.

const callLogSchema = new mongoose.Schema({
  streamSid: { type: String, required: true },
  transcript: [transcriptSchema],
  events: [callEventSchema],
  callStartTime: Date,
  callEndTime: Date,
  createdAt: { type: Date, default: Date.now }
});

export const CallLog = mongoose.model('CallLog', callLogSchema);
