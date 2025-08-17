document.getElementById("generate").onclick = async () => {
  const res = await fetch("https://<YOUR-BACKEND-URL>/generate-report", { method: "POST" });
  const data = await res.json();
  document.getElementById("output").textContent = JSON.stringify(data, null, 2);
};
