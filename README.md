## deftly demo
This is pretty rough, still a work in progress.

## Starting

```bash
npm install
npm start
```

## Features

### http transport
There is a somewhat over-simplified http transport based on express that shows how deftly transports can expose resource actions over a transport.

### metric collection
The index turns on local metrics collection for in-memory storage. There's also a telemetry resource with a single action that exposes the metric's report in JSON format. You can hit it via curl: `curl http://localhost:8800/telemetry`

### console logger plugin
The plugin shows how simple it is to adapt just about anything to deftly's logging abstraction. This one just makes certain that info entries from the transport make it to the console.