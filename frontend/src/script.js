const user = document.getElementById("username");
const mdp = document.getElementById("mdp");
const envoyer = document.getElementById("send");
const userR = document.getElementById("usernameR");
const mdpR = document.getElementById("mdpR");
const envoyerR = document.getElementById("sendR");

envoyerR.addEventListener("click", async () => {
    try {
        const reponse = await fetch("http://localhost:8081/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({ username: userR.value, password: mdpR.value })
        });
        if (reponse.ok) {
            alert("Utilisateur créé avec succès");
        }
        else {
            const errorData = await reponse.json();
            alert("Erreur : " + errorData.error);
        }
    } catch (error) {
        console.error("Erreur réseau ou serveur :", error);
    }
});



envoyer.addEventListener("click", async () => {
    try {
        const reponse = await fetch("http://localhost:8081/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({ username: user.value, password: mdp.value })
        });
        if (reponse.ok) {
            window.location.href = "chat.html"
        }
        else {
            const errorData = await reponse.json();
            alert("Erreur : " + errorData.error);
        }
    } catch (error) {
        console.error("Erreur réseau ou serveur :", error);
    }

});


