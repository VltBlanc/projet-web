const user = document.getElementById("username");
const mdp = document.getElementById("mdp");
const envoyer = document.getElementById("send");


envoyer.addEventListener("click", async () => {
    try {
        reponse = await fetch("http://localhost:8081/login", {

            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({ username: user.value, password: mdp.value })
        });
        if (reponse.ok) {
            window.location.href="chat.html"
        }
        else {
            const errorData = await reponse.json();
            alert("Erreur : " + errorData.error);
        }
    } catch (_error) {
        console.error("Erreur réseau ou serveur :", error);
    }

});


