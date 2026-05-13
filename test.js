fetch("http://localhost:3000/ainhub-alert", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-KEY": "7137568126"
  },
  body: JSON.stringify({
    type: "new_user",
    username: "abdulla",
    plan: "Elite"
  })
})
.then(res => res.json())
.then(console.log)
.catch(console.error);