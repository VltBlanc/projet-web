
// DOM
let send_message_button = document.getElementById("send");
let new_message = document.getElementById("new_message");
let chat_box = document.getElementById("chat_box");

// Backend
const ws = new WebSocket(`ws://localhost:8081/ws`);

// Listener
send_message_button.addEventListener("click", function (event) {
    event.preventDefault(); // Prevent default form submission
    // Send
    const mesEnvoie = {
        message: new_message.value
    };
    ws.send(JSON.stringify(mesEnvoie));
    new_message.value = ""
});

ws.onopen = function () {
    console.log('WebSocket connection established.');
};

ws.onmessage = function (event) {
    console.log(`WebSocket received message: ${event.data}.`);

    const message = event.data;
    let data;
    try {
        data = JSON.parse(message);
    } catch {
        console.error("Malformed WebSocket message received");
        return;
    }

    if ("go_to_login" in data) {
        window.location.href = "login.html"
    }
    // --- AFFICHAGE DU MESSAGE ---
    if (data.message && data.owner) {
        // 1. Créer un nouvel élément div pour le message
        const messageDiv = document.createElement("div");
        messageDiv.className = "message";

        const strong = document.createElement("strong");
        strong.textContent = `${data.owner} : `;
        messageDiv.appendChild(strong);
        messageDiv.appendChild(document.createTextNode(data.message));

        chat_box.appendChild(messageDiv);

        chat_box.scrollTop = chat_box.scrollHeight;
    }
};

ws.onerror = function (error) {
    console.error('WebSocket error:', error);
    window.location.href = "login.html";
};

ws.onclose = function (event) {
    console.log('WebSocket connection closed:', event);
    window.location.href = "login.html";
};
