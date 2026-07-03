 
'use strict';
 
const catalyst = require('zcatalyst-sdk-node');
const axios = require('axios');
 
module.exports = async (req, res) => {
 
let body = "";
 
req.on("data", chunk => {
body += chunk;
});
 
req.on("end", async () => {
 
try {
 
console.log("Function invoked");
 
if (!body) {
throw new Error("Request body is empty.");
}
 
console.log("Request Body:", body);
 
const input = JSON.parse(body);
const contactId = input.contactId;
 
console.log("Contact ID:", contactId);
 
const app = catalyst.initialize(req);
 
const connections = app.connections();
 
console.log("Getting connection credentials...");
 
const creds =
await connections.getConnectionCredentials("ziaagent");
 
console.log("Connection successful");
 
const payload = {
query: `
You are an AI concierge for a luxury hotel.
 
Use the crm_getRecordById tool to fetch the Contact record with Record ID: ${contactId}.
 
Recommend exactly one available room.
 
Base your recommendation on:
- Loyalty history
- Stay frequency
- Room preferences
- Upgrade history
- Special requests
 
Return ONLY valid HTML using: <h2>, <h3>, <p>, <ul>, <li>, <table>, <tr>, <th>, <td>, <strong>
 
Do not return Markdown. Do not wrap in code fences.
`,
reasoning: false,
attachments: [],
systemArgs: {
crm_getRecordById: {
record_id: contactId
}
}
};
 
console.log("Calling Zia Agent...");
 
const response = await axios.post(
"https://ziaagents.zoho.com/ziaagents/api/v1/agents/XXX/trigger",//Replace with your Zia Agent API endpoint
payload,
{
headers: {
Authorization: creds.headers.Authorization,
"Content-Type": "application/json",
"X-ZIAAGENTS-ORG": "XXXXX",//Replace with your Zia Agents Org ID
"X-ZIAAGENTS-AGENT-SESSION-ID": null
},
timeout: 600000
}
);
 
console.log("Zia Agent completed");
console.log("Execution ID:", response.data.data.executionId);
 
res.setHeader("Content-Type", "application/json");
 
res.statusCode = 200;
 
res.end(JSON.stringify({
success: true,
executionId: response.data.data.executionId,
html: response.data.data.response
}));
 
}
catch (e) {
 
console.error("ERROR:", e.response?.data || e);
 
res.setHeader("Content-Type", "application/json");
res.statusCode = 500;
 
res.end(JSON.stringify({
success: false,
error: e.message,
details: e.response?.data || {}
}));
 
}
 
});
 
};