# Bring!

**Connecteur non officiel, sans lien avec Bring! Labs.** Il amène vos listes
de courses [Bring!](https://www.getbring.com/) dans Gladys : un widget pour
voir, ajouter et cocher des articles, des actions et des déclencheurs de
scène. Bring! n'a pas d'API publique : l'intégration parle à Bring! comme le
fait l'application web Bring!, que Bring! peut changer à tout moment. Bring!
est une marque de Bring! Labs AG.

## Ce que vous obtenez

| Surface               | Contenu                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Widget                | **Liste de courses Bring!** : les articles à acheter d'une liste, un formulaire **Ajouter**, un formulaire **Cocher** qui liste les articles, un article en un clic facultatif |
| Actions de scène      | **ajouter un article** (liste, article, précision), **cocher un article**, **retirer un article**, **lire une liste** (nombre d'articles, articles séparés par des virgules)   |
| Déclencheurs de scène | **article ajouté**, **article coché**, **liste vidée** (les courses sont faites)                                                                                               |

Aucun appareil n'est créé : une liste Bring! n'est pas un appareil.

## Installation

1. Installez l'intégration, ouvrez sa configuration et saisissez l'**e-mail**
   et le **mot de passe** de votre compte Bring!. Le mot de passe n'est envoyé
   qu'à Bring! (`api.getbring.com`) ; Gladys le stocke chiffré.
2. Cliquez sur **Tester le compte** : il affiche vos listes, leur nombre
   d'articles et la langue de leurs articles.
3. Placez le widget **Liste de courses Bring!** sur un tableau de bord.
   Saisissez le nom d'une liste dans ses réglages, ou laissez vide pour votre
   liste par défaut. Un article en un clic (par exemple « Lait ») ajoute un
   bouton qui le met tout de suite sur la liste.

Si vous vous connectez à Bring! avec Google ou Apple, votre compte n'a
peut-être pas de mot de passe. Créez un second compte Bring! avec un e-mail
et un mot de passe, puis invitez-le à vos listes depuis l'application
Bring! : l'intégration voit les listes partagées.

### Noms des articles

Bring! enregistre les articles de son catalogue sous un nom allemand
(« Milch ») et les affiche dans la langue de chaque liste (« Lait »,
« Milk »). L'intégration fait de même dans les deux sens : le widget et les
scènes affichent « Lait », et quand vous ajoutez « lait » à une liste en
français, c'est l'article du catalogue (avec son icône) qui est ajouté. Un
texte absent du catalogue (« Piles AA ») est ajouté tel quel.

## Scènes

- **Article ajouté** : quelqu'un a ajouté un article à une liste, dans
  l'application Bring! ou sur une liste partagée. Variables : la liste,
  l'article, sa précision, le nombre d'articles à acheter.
- **Article coché** : un article a été acheté (coché dans l'application). Un
  article supprimé ne compte pas.
- **Liste vidée** : le dernier article d'une liste a été coché ou retiré.

Les filtres comparent à l'identique : saisissez la liste et l'article tels que
Bring! les affiche (« Courses », « Lait »), ou laissez vide pour tous. Les
modifications faites depuis Gladys (action de scène, widget) ne déclenchent
rien, pour qu'une scène ne puisse pas boucler à travers l'intégration.

Les actions renvoient des valeurs pour les étapes suivantes : **ajouter un
article** donne `item` et `count`, **cocher** et **retirer** donnent `done`
(faux si l'article n'était pas sur la liste), **lire une liste** donne
`count` et `items` (« Lait (2 l), Pain, Oeufs »), pratique dans un message.
Les actions suivantes de la scène les trouvent dans leur liste de variables
(écrites `{{<étape>.<action>.<clé>}}`, par exemple `{{0.0.items}}` quand
**lire une liste** est la première action de la scène).

## Rythme

Tant que les listes sont surveillées (option **Surveiller les listes**,
activée par défaut), chaque liste est lue toutes les 2 minutes (option
**Intervalle de rafraîchissement**, 1 minute au minimum), et aussitôt après
une modification faite depuis Gladys. Les noms des listes et leur langue sont
lus une fois par heure, les traductions des articles une fois par jour.
Option désactivée, rien ne tourne en arrière-plan : le widget et les actions
lisent une liste quand ils en ont besoin, et les déclencheurs ne se
déclenchent jamais.

## Dépannage

- **« Bring! a refusé l'e-mail ou le mot de passe »** : corrigez-les dans la
  configuration et enregistrez ; l'intégration ne réessaie pas d'elle-même,
  un mauvais mot de passe ne peut donc pas bloquer votre compte.
- **« Bring! est injoignable »** : l'intégration réessaie au rafraîchissement
  suivant. Si cela dure, Bring! a peut-être changé son API web : ouvrez un
  ticket.
- **Un déclencheur ne se déclenche pas** : vérifiez que les listes sont
  surveillées et que le filtre est écrit exactement comme dans Bring!
  (majuscules comprises).
- **Les formulaires du widget ne font rien** : les formulaires derrière un
  bouton nécessitent Gladys 5.2 ou plus récent ; l'article en un clic
  fonctionne dès la 5.1.
- Journaux : le niveau de log de l'intégration se règle avec la variable
  `LOG_LEVEL`.

## Confidentialité

L'e-mail et le mot de passe ne sont envoyés qu'à Bring!, jamais journalisés.
Après la première connexion, l'intégration garde la session Bring! (votre
identifiant d'utilisateur et un jeton de renouvellement) dans la configuration
de Gladys, pour qu'un redémarrage ne renvoie pas le mot de passe. Les listes
restent entre Gladys et Bring!.
