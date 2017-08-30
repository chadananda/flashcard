# Flashcard Prototype

Quick flashcard prototype to experiment with getting the flow right

### Demo:   

#### https://chadananda.github.io/flashcard/

### Summary

The intention here is to support puggable types each with their own session rules but sharing a scheduling engine.

I am incorporating audio carefully so the sessions are both assessment and practice.

This Prototype currently supports two card types, "Vocabulary" and "Language Vocabulary". The "Language Vocabulary" cards test En->Ar and then, when the user gets the card correct three times, flips the card to Ar->En.

Each answer also has a number. The user can hit the number key to select a card.

During a session, cards "due" are loaded into a "hand" with max 6 cards at a time. Resources for these cards are pre-cached for fast operation.

### Concepts Implemented

* card: data object containing everything necessary for a learning experience, includes "due" schedule
* session: a set of time spent on cards currently due
  * session.hand
  * session.additional
  * session.all  
* cardsDue: all cards with a scheduled date of today or earlier
* hand: a small group (5-10) of the cardsDue which are rotated at a time for practice
* store: object for managing storage of user cards and provision for importing new cards


### Concepts Planned

* decks: available new cards in sets, with a group description
* queue: sets of cards queued up for assignment at defined rate
  * queue.trickle: rate new cards from queue are assigned
  * queue.trickle.autofeed: option to automatically feed session when hand gets low
  
  
### Additional Screens Planned

* User login
* Assignment selection
* Activity summary


