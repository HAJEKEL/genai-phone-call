require("dotenv").config();  //  loads configuration from a .env file into the environment using the dotenv package.
const express = require("express"); // import express.js library to create express.js app
const ExpressWs = require("express-ws"); // adds WebSocket support to an Express.js application.

const { TextToSpeechService } = require("./tts-service");
const { TranscriptionService } = require("./transcription-service");

const app = express(); //express.js app instance
ExpressWs(app); //add websocket support

const PORT = 3000; //set server port

app.post("/incoming", (req, res) => { // Handle an incoming HTTP POST request at /incoming, it is the webhook for the phonecall
  res.status(200);
  res.type("text/xml"); //xml response that sets up bi-directional streaming phone call with the app streamed at the url defined in .env
  res.end(`
  <Response>
    <Connect>
      <Stream url="wss://${process.env.SERVER}/connection" />
    </Connect>
  </Response>
  `);
});

app.ws("/connection", (ws, req) => { // sets up a WebSocket route at /connection
  ws.on("error", console.error); //event listener for the "error" event and calling built-in javascript console.error 
  // Filled in from start message
  let streamSid;

  const transcriptionService = new TranscriptionService(); //initialize stt
  const ttsService = new TextToSpeechService({}); //initialize tts

  // Incoming from MediaStream
  ws.on("message", function message(data) {
    const msg = JSON.parse(data);
    if (msg.event === "start") {
      streamSid = msg.start.streamSid;
      console.log(`Starting Media Stream for ${streamSid}`);
    } else if (msg.event === "media") {
      transcriptionService.send(msg.media.payload);
    } else if (msg.event === "mark") {
      const label = msg.mark.name;
      console.log(`Media completed mark (${msg.sequenceNumber}): ${label}`)
    }
  });

  transcriptionService.on("transcription", (text) => {
    console.log(`Received transcription: ${text}`);
    ttsService.generate(text);
  });

  ttsService.on("speech", (audio, label) => {
    console.log(`Sending audio to Twilio ${audio.length} b64 characters`);
    ws.send(
      JSON.stringify({
        streamSid,
        event: "media",
        media: {
          payload: audio,
        },
      })
    );
    // When the media completes you will receive a `mark` message with the label
    ws.send(
      JSON.stringify({
        streamSid,
        event: "mark",
        mark: {
          name: label
        }
      })
    )
  });
});

app.listen(PORT);
console.log(`Server running on port ${PORT}`);