const r=await fetch('http://127.0.0.1:3100/healthz',{signal:AbortSignal.timeout(8000)});if(!r.ok)process.exit(1);
