import { CallLog } from '../models/CallLog.js';

export async function saveCallLog(data) {
  try {
    const callLog = new CallLog(data);
    await callLog.save();
    console.log('Call log saved:', callLog);
  } catch (error) {
    console.error('Failed to save call log:', error);
  }
}

export async function getCallLogs() {
  try {
    return await CallLog.find().sort({ timestamp: -1 });
  } catch (error) {
    console.error('Failed to retrieve call logs:', error);
    return [];
  }
}
