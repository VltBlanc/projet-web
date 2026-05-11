Projet docker / web / BD / CI

Partie Web :

    Access / Refresh Token
    CORS (un front et un back) => pas de reverse proxy svp
    Middlewares
    Websocket
    Hash des passwords avec sel et poivre
    Cookies sécurisés pour les transferts de tokens
    REST
    HTTPS
    Pas de framework structurant (que du HTML / JS / CSS)

Partie BD :

    environ 5 tables

Partie déploiement :

    un seul fichier compose

Partie CI :

    Tests unitaires sur un module critique
    Lint et pre-commit
    Pousser automatiquement les images sur un container registry

Contraintes de fonctionnalités :

    Il faut au moins 2 rôles avec des accès différents (e.g. admin ou pas)
    Au moins une page dynamique (e.g. temps réel, animations, etc.)

Choix du sujet et des groupes :

    Libre si vous n'avez pas reçu un message privé indiquant le contraire
    Par groupes de 3

Pour la soutenance, vous aurez 20/25 minutes par groupe + éventuelles questions :

    Présentation du projet (~ 1min)
    Gestion de projet / séparation des tâches (~ 3 mins)
    Fonctionnalités (~ 2 mins)
    Architecture logicielle : (~ 5 mins)
        Interactions entre les modules
        Système de build
    Présentation de la CI (~ 2 mins)
    Live démo (~ 3 mins)
    Présentation d'un module dont vous êtes particulièrement fiers, e.g. algorithmiquement sympa ou utilisant des concepts avancés de génie logiciel, vous montrez du code. (~ 5 mins)