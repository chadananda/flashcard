"use strict"

// ## Flashcard Manager Object
// Lightweight logic for managing user flashcards with spaced-repitition logic
//  and puggible flashcard types, each with their own content, display logic and
//  session completion rules
 
// Terms and Objects
//   card: data object containing everything necessary for a learning experience, includes "due" schedule
//   session: a set of time spent on cards currently due
//     session.hand
//     session.additional
//     session.all
//   cardsDue: all cards with a scheduled date of today or earlier
//   currentSet: a small group (5-10) of the cardsDue which are rotated at a time for practice
//   store: object for managing storage of user cards and provision for importing new cards

//  decks: available new cards in sets, with a group description
//  queue: sets of cards queued up for assignment at defined rate
//    queue.trickle: rate new cards from queue are assigned
//    queue.trickle.autofeed: option to automatically feed session when hand gets low

// New Screens:
// * User login
// * Assignment selection
// * Activity summary

// Refactoring
// * move all custom bits back into displaycard
//   * make files object generic so we can preload from an array
// * get the timer externalized somehow
// * add card instantiation with validation (including during preload)
//  * find way to precache images
// * can we make the object composable? With different card types in different files?
// * can we create an external CouchDB based card storage? Deck Storage?
// * can we create a web-based card-creation tool?


 

// Card {
//   id=`${type}-${hash}`,
//   type="vocab", 
//   level=0, 
//   next_session=173869, // scheduling  
//   content: {  // content varies by type
//     question, answers, audio: fileid, picture: fileid, files: [fileids]
//   } 
// }

// session: 
//   status[card_id] {completed, passed, history} 
//   cards.hand: []
//   cards.additional: []
//   cards.completed: []
//   current_card_done: bool 

 
 

class Flashcards {

  constructor(cardStore, displayElementID = 'flashcard_container') { 
    let today = this._today() 
    this.cards = {}
    cardStore.cards.forEach(card=> {
      if (['lang_vocab', 'vocab'].indexOf(card.type)>=0) { 
        if (!card.schedule) card.schedule = today
        if (!card.level) card.level = 0 
        this.cards[card.id] = card  
      }
    })
    this.history = cardStore.all 
    this.session = null 
    this.el = document.getElementById(displayElementID)
    $(this.el).text('')
    this.initializeAudio()
  }

  initializeAudio() {
    // when we are done, we'll move these sounds to the project folder
    this.sounds = {}
    let soundsDir = '../assets'
    this.sounds.snap = new Howl({ src: [`${soundsDir}snap.mp3`], preload: true, volume: .15 })
    this.sounds.tap = new Howl({ src: [`${soundsDir}tap.mp3`], preload: true, volume: .15  })
    this.sounds.broken = new Howl({ src: [`${soundsDir}light_bulb_breaking.mp3`], preload: true, volume: .05  })   
    // set up voice commands 
    annyang.start()
    annyang.removeCommands()
    annyang.debug()
    let commands = {
      "one":    ()=>this.pressKey('1') ,
      "two":    ()=>this.pressKey('2') ,
      "three":  ()=>this.pressKey('3') ,
      "four":   ()=>this.pressKey('4') 
    }   
    annyang.addCommands(commands)
  }

  playPreloadedSound(sound, pauseBefore=0, pauseAfter=0) { 
    return new Promise((resolve, reject) => {   
      if (sound.playing()) sound.stop() 
      setTimeout(() => { 
        sound.on('end', () => setTimeout(resolve, pauseAfter))
        sound.play() 
      }, pauseBefore)
    })
  }

  presskey(character) {
    jQuery.event.trigger({ type : 'keypress', which : character.charCodeAt(0) });
  }

  // start a practice session either with a set of cards or with the cards currently due
  startSession(cards_due=null) {
    
    const HAND_COUNT = 3 // that is, how many cards to work on at one time 
    if (cards_due===null) cards_due = _shuffleArray(this._cardsDue())
    if (cards_due.length) {
      this.session = { hand:[], completed:[], status:{}, additional: cards_due.slice(HAND_COUNT) } 
      // load up cards in hand, including preloading audio
      cards_due.slice(0, HAND_COUNT).forEach((card_id) => this.addCardtoHand(card_id) ) 
      // create session entry 
      this.displayNextCard() 
    }
  }


  // show current card
  displayNextCard() {  
    let hand = this.session.hand 
    let card = this.cards[this.session.hand[0]]   
    let displayer = null
    if (!card) this.displayCard_done(this)  
      else if (card.type==='vocab') displayer = this.displayCard_vocab
      else if (card.type==='lang_vocab') displayer = this.displayCard_lang_vocab
      else if (card.type==='quote') displayer = this.displayCard_quote   
    // displayer is a promise which returns a card_status object
    if (displayer) { 
      displayer(card, this).then((card_status) => {
        // this.sounds.tap.play()
        if (!card_status || card_status==='cancel_session') {  
          this.session = null
          return this.displayCard_done(this) 
        }  
        // reschedule card if completed, removing it from session
        if (card_status.completed) {    
          this.removeCardFromHand(card.id, card_status.passed)
          this.addCardtoHand(this.session.additional.pop()) 
        } else hand.push(hand.shift())
        // show next card if any remain in the hand
        if (hand.length>0) this.displayNextCard()
          else this.displayCard_done(this) 
      }) 
    }
  }

  removeCardFromHand(card_id, passed) {
    let index = this.session.hand.indexOf(card_id)
    if (index>=0) {
      let card = this.cards[card_id]
      this._rescheduleCard(card, passed)  
      this.session.hand.splice(index, 1)
      this.preloadCardAudio(card_id, true)  // flush audio
    }
  }

  // get new card for hand, create session tracker and preload audio
  addCardtoHand(card_id) {
    if (!card_id) return
    let card = this.cards[card_id]
    this.session.hand.push(card_id) 
    let status = this.session.status
    // ***************************************
    // TODO: create a single status history type so we don't need to to this!!
    // ***************************************
    // ***************************************
    // ***************************************
    if (card.type==='vocab') status[card_id] = {completed:false, passed:false, history:[]}
     else if (card.type==='lang_vocab') status[card_id] = {completed:false, passed:false, history:[[],[]], l1:0}
    this.preloadCardAudio(card_id)  
  }

  // preload or unload audio for cards in current hand
  preloadCardAudio(card_id, unloadAudio=false) { 
    let card = this.cards[card_id]
    let status = this.session.status[card_id]
    // adds to current hand and preloads assets
    if (!unloadAudio) {
      status.audioPreload = [] 
      if (card.files.aud) card.files.aud.forEach((audio) => status.audioPreload.push(new Howl({ src: [audio], volume: .5 })))
    } else { 
      status.audioPreload.forEach((sound, index)=> sound.unload())
      status.audioPreload = [] 
    } 
  }

  // takes a card, returns a promise resolving to a session status object
  displayCard_vocab(card, that) {   
    // create a promise that displays and manages card. Resolves to session_status allowing rescheduling of card
    return new Promise((resolve, reject) => {  
      const CARD_TIMEOUT = 6000
      var START_TIME = new Date().getTime()  
      that.session.current_card_done = false  

      // main response to answering a card
      let selectAnswer = function(answer) {   
        setCardEvents(false) // clear UI events for this card
        if (answer==='cancel_session') return resolve_card('cancel_session') 
        if (answer==='skip_card') return resolve_card('skip_card')   
        let isCorrect = (answer === card.content.answer)
        let status = updateCardStatus(card, isCorrect)
        revealCardAnswers(answer, isCorrect) 
        // play appropriate sound then display next card after suitable delay
        if (isCorrect) { 
          that.sounds.snap.play(); 
          setTimeout(()=> resolve_card(status), 400) 
        } else {
          that.sounds.broken.play() 
          waitForCorrectCardClick(status)
        }
      }

      // wait for user to click on word
      let waitForCorrectCardClick = function(status) {
        const MAX_REPLAY = 5
        let playcount = 0
        let sound = that.session.status[card.id].audioPreload[0] 
        let correctCardClicked = false
        $('.answer.correct').click(() => { sound.stop(); correctCardClicked=true; resolve(status) })
        function repeatSound() { 
          if (!correctCardClicked && that.session && playcount++ < MAX_REPLAY) that.playPreloadedSound(sound, 0, 2000).then(()=> repeatSound() ) 
        }  
        setTimeout(()=> repeatSound(), 1000)
      }
 
      // show results of user selection
      let revealCardAnswers = function(answer, isCorrect) {
        let correct_answer = card.content.answer
        $('#vocab_flashcard .answer').each(function() {
          if ($(this).text()===correct_answer) {
            $(this).addClass('correct')
            if (answer!=correct_answer) {
              $(this).addClass('correction')
              $(this).append('<img src="ic_arrow_left.svg" class="correct_arrow" />')
            }
          }
          if (!isCorrect) {
            if ($(this).text()!=correct_answer) $(this).addClass('wrong')  
            if ($(this).text()!=correct_answer && $(this).text()===answer) $(this).removeClass('wrong').addClass('wrongselection') 
          }
        })
      }

      // logic to update session.status
      let updateCardStatus = function(card, isCorrect) {  
        let status = that.session.status[card.id]   
        status.history.push(isCorrect)  
        status.completed = (status.history.slice(status.history.length-3).filter(passed=>passed).length === 3)
        status.passed = status.history.filter(passed=>passed).length === status.history.length  
        return status
      }
 
      // timer bar
      let moveProgressBar = function() { 
        // if (!that.session) console.error('that.session is null?: ', that)  else 
        if (!that.session || that.session.current_card_done) {
          $('#vocab_flashcard .timeout').hide()
        } else {
          $('#vocab_flashcard .timeout').show()
          let elapsed = new Date().getTime() - START_TIME;
          if (elapsed<CARD_TIMEOUT) { 
            let timeout = document.getElementById('timeout')
            let progressbar = document.getElementById('timeout-progress') 
            progressbar.style.left = Math.round((elapsed / CARD_TIMEOUT) * timeout.offsetWidth) + 'px'
            setTimeout(moveProgressBar, 100) // call back in 100ms
          } else {
            $('#vocab_flashcard .timeout').hide()
            selectAnswer('skip_card') // skip card if timeoutelse selectAnswer('') // force wrong answer 
          }
        }
      } 

      // click and resize events for this card
      let setCardEvents = function (on=true) {
        if (on) {
         var resizeCard = function(initial=false) {  
            window.fitText( document.querySelector(".flashcards .title"), 1.5 )
            window.fitText( document.querySelector(".flashcards .question"), .85 )
            window.fitText( document.querySelectorAll(".flashcards .answer"), 1.5 )
            if (initial && !card.files.aud.length) moveProgressBar()
          }          
          resizeCard(true)  

          $('#vocab_flashcard .answer').click(function() {  selectAnswer( $(this).text() ) })
          $('#vocab_flashcard .cancel').click(function() { 
            that.session.current_card_done = true
            selectAnswer('cancel_session')
          })    
          $('#vocab_flashcard').resize(resizeCard) 

          // keypress events
          $('html').keypress((e) => { if (['1','2','3','4'].indexOf(e.key)>=0) $(`.answer.a${e.key}`).trigger( "click" ) })
          
          // set up audio play
          if (card.files.aud) { 
            let sound = that.session.status[card.id].audioPreload[0]
            // play twice then start timer 
            if (!that.session.current_card_done) that.playPreloadedSound(sound, 0, 500).then(() => {
              START_TIME = new Date().getTime() 
              moveProgressBar()  
              if (!that.session.current_card_done) that.playPreloadedSound(sound) 
            })
            $(".audio, .question").addClass('clickable').click(() => that.playPreloadedSound(sound))
          }

          // set up voice commands 
          annyang.debug()
          let commands = {
            "one":  function() {console.log('one')},
            "two":   () => console.log('two'),
            "three": () => console.log('three'),
            "four":  () => console.log('four')
          }   
          annyang.addCommands(commands)

        } else {
          that.session.current_card_done = true
          if (that.session.status[card.id].audioPreload) that.session.status[card.id].audioPreload[0].stop() 
          $('#vocab_flashcard .answer').off('click')
          $('#vocab_flashcard .audio img').off('click') 
          $('#vocab_flashcard').off('resize') 
          $('#vocab_flashcard .question').off('click')
          $('#vocab_flashcard .audio').off('click')
          // stop the progress bar ?
          annyang.removeCommands()
        }
      }

      // card template
      let renderCard = function() { 
        let total_cards = that.session.hand.length + that.session.additional.length
        let total_cards_completed = that.session.completed.length
        let main_sound = that.session.status[card.id].audioPreload[0]
        // select three random incorrect answers and shuffle with correct answer
        let answers = _shuffleArray(_shuffleArray(card.content.incorrect).slice(0, 3).concat([card.content.answer]))  
          .map((answer, index) => `<div class='answer a${index+1}'>${answer}<span data-num='${index+1}'></span></div>`).join('\n')  
        // vocab_flashcard style 
        let cardHTML = `<div id='vocab_flashcard' class="flashcards"> <img class='iphone' src="iPhone-6-wireframe.png" />
            <div class='audio' style='${main_sound? '': 'display:none'}'><img src="ic_play_circle_filled_black_24px.svg" /></div>
            <div class='title'> Flashcards (${total_cards_completed}/${total_cards} done) </div>
            <div class='cancel'><img src="ic_cancel_black_24px.svg"/></div>
            <div class='question'>${card.content.question}</div>
            <div class='description'>${card.content.description}</div>
            <div class='timeout' id='timeout'><div id="timeout-progress"></div></div>
            ${answers}  
          </div> ` 
        $(that.el).html(cardHTML)  
        setCardEvents()
      }

      let resolve_card = function(status) { 
        setCardEvents(false)
        resolve(status)
      }

  
  
       
      //setupVoiceCommands()
      renderCard() 
    }) 
  }

  displayCard_lang_vocab(card, that) {
    // create a promise that displays and manages card. Resolves to session_status allowing rescheduling of card
    return new Promise((resolve, reject) => {  
      const CARD_TIMEOUT = 6000
      var START_TIME = new Date().getTime()  
      that.session.current_card_done = false   
      // these cards test in both directions language #1 and language #2. L1 is the direction being tested 
      let l1 = that.session.status[card.id].l1
      let l2 = l1 === 0 ? 1 : 0

      // main response to answering a card
      let selectAnswer = function(answer) {   
        setCardEvents(false) // clear UI events for this card
        if (answer==='cancel_session') return resolve_card('cancel_session') 
        if (answer==='skip_card') return resolve_card('skip_card')   
        let isCorrect = (answer === card.content.words[l2])
        let status = updateCardStatus(card, isCorrect)
        revealCardAnswers(answer, isCorrect) 
        // play appropriate sound then display next card after suitable delay
        if (isCorrect) { 
          that.sounds.snap.play(); 
          setTimeout(()=> resolve_card(status), 400) 
        } else {
          that.sounds.broken.play() 
          waitForCorrectCardClick(status)
        }
      }

      // wait for user to click on word
      let waitForCorrectCardClick = function(status) {
        const MAX_REPLAY = 5
        let playcount = 0
        let sound = that.session.status[card.id].audioPreload[l2] 
        let correctCardClicked = false
        $('.answer.correct').click(() => { sound.stop(); correctCardClicked=true; resolve(status) })
        function repeatSound() { 
          if (!correctCardClicked && that.session && playcount++ < MAX_REPLAY) that.playPreloadedSound(sound, 0, 2000).then(()=> repeatSound() ) 
        }  
        setTimeout(()=> repeatSound(), 1000)
      }
 
      // show results of user selection
      let revealCardAnswers = function(answer, isCorrect) {
        let correct_answer = card.content.words[l2]
        $('#vocab_flashcard .answer').each(function() {
          if ($(this).text()===correct_answer) {
            $(this).addClass('correct')
            if (answer!=correct_answer) {
              $(this).addClass('correction')
              $(this).append('<img src="ic_arrow_left.svg" class="correct_arrow" />')
            }
          }
          if (!isCorrect) {
            if ($(this).text()!=correct_answer) $(this).addClass('wrong')  
            if ($(this).text()!=correct_answer && $(this).text()===answer) $(this).removeClass('wrong').addClass('wrongselection') 
          }
        })
      }

      // logic to update session.status
      let updateCardStatus = function(card, isCorrect) {  
        let status = that.session.status[card.id]   
        status.history[l1].push(isCorrect)  
        status.completed = (status.history[l1].slice(status.history[l1].length-3).filter(passed=>passed).length === 3)
        status.passed = status.history[l1].filter(passed=>passed).length === status.history[l1].length  
        if (status.completed && l1===0) {
          status.completed = false
          that.session.status[card.id].l1 = 1 // flip card
        }
        return status
      }
 
      // timer bar
      let moveProgressBar = function() { 
        // if (!that.session) console.error('that.session is null?: ', that)  else 
        if (!that.session || that.session.current_card_done) {
          $('#vocab_flashcard .timeout').hide()
        } else {
          $('#vocab_flashcard .timeout').show()
          let elapsed = new Date().getTime() - START_TIME;
          if (elapsed<CARD_TIMEOUT) { 
            let timeout = document.getElementById('timeout')
            let progressbar = document.getElementById('timeout-progress') 
            progressbar.style.left = Math.round((elapsed / CARD_TIMEOUT) * timeout.offsetWidth) + 'px'
            setTimeout(moveProgressBar, 100) // call back in 100ms
          } else {
            $('#vocab_flashcard .timeout').hide()
            selectAnswer('skip_card') // skip card if timeoutelse selectAnswer('') // force wrong answer 
          }
        }
      } 

      // click and resize events for this card
      let setCardEvents = function (on=true) {
        if (on) {
          var resizeCard = function(initial=false) {  
            window.fitText( document.querySelector(".flashcards .title"), 1.5 )
            if (['fa','ar'].indexOf(card.content.lang[l1])>=0) {
              window.fitText( document.querySelector(".flashcards .question"), .65 ) // ar
              window.fitText( document.querySelectorAll(".flashcards .answer"), 1 ) // en
            } else {
              window.fitText( document.querySelector(".flashcards .question"), .85 ) // en
              window.fitText( document.querySelectorAll(".flashcards .answer"), .85 ) // ar
            } 
            if (initial && !card.files.aud[l1]) moveProgressBar()
          }          
          resizeCard(true)  

          $('#vocab_flashcard .answer').click(function() {  selectAnswer( $(this).text() ) })
          $('#vocab_flashcard .cancel').click(function() { 
            that.session.current_card_done = true
            selectAnswer('cancel_session')
          })    
          $('#vocab_flashcard').resize(resizeCard) 

          // keypress events
          $('html').keypress((e) => { if (['1','2','3','4'].indexOf(e.key)>=0) $(`.answer.a${e.key}`).trigger( "click" ) })
          
          
          // set up audio play
          if (card.files.aud[l1]) { 
            let sound = that.session.status[card.id].audioPreload[l1]
            // play twice then start timer 
            if (!that.session.current_card_done) that.playPreloadedSound(sound, 500, 300).then(() => {
              START_TIME = new Date().getTime() 
              moveProgressBar()  
              if (!that.session.current_card_done) that.playPreloadedSound(sound) 
            })
            $(".audio, .question").addClass('clickable').click(() => that.playPreloadedSound(sound))
          }
        } else { // remove events so buttons don't get accidentally clicked twice etc.
          that.session.current_card_done = true  // stop the progress bar  
          if (that.session.status[card.id].audioPreload[l1]) that.session.status[card.id].audioPreload[l1].stop() 
          $('#vocab_flashcard .answer').off('click')
          $('#vocab_flashcard .audio img').off('click') 
          $('#vocab_flashcard').off('resize') 
          $('#vocab_flashcard .question').off('click')
          $('#vocab_flashcard .audio').off('click')
        }
      }
 
      // card template
      let renderCard = function() { 
        // select three random incorrect answers and shuffle with correct answer
        let total_cards = that.session.hand.length + that.session.additional.length
        let total_cards_completed = that.session.completed.length  
        let main_sound = that.session.status[card.id].audioPreload[l1]
        let answers = _shuffleArray(_shuffleArray(card.content.incorrect[l2]).slice(0, 3).concat([card.content.words[l2]]))  
          .map((answer, index) => `<div class='answer a${index+1}'><span class='text'>${answer}</span><span data-num='${index+1}'></span></div>`).join('\n') 
        // vocab_flashcard style 
        let cardHTML = `<div id='vocab_flashcard' class="flashcards"> <img class='iphone' src="iPhone-6-wireframe.png" />
            <div class='audio' style='${main_sound ? '' : 'display:none'}'><img src="ic_play_circle_filled_black_24px.svg" /></div>
            <div class='title'> Flashcards (${total_cards_completed}/${total_cards} done) </div>
            <div class='cancel'><img src="ic_cancel_black_24px.svg"/></div>
            <div class='question'>${card.content.words[l1]}</div>
            <div class='description'>${card.content.description}</div>
            <div class='timeout' id='timeout'><div id="timeout-progress"></div></div>
            ${answers}  
          </div> ` 
        $(that.el).html(cardHTML)  
        setCardEvents()
      }

      let resolve_card = function(status) {

        resolve(status)
      }
  
      renderCard() 
    }) 
  }

  displayCard_quote(card, that) {}

  displayCard_done(that) {
    let html = `
      <div id='vocab_flashcard' class="flashcards"> <img class='iphone' src="iPhone-6-wireframe.png" />
        <div class='audio'></div>
        <div class='title'></div>
        <div class='cancel'></div>
        <div class='question'>
          Flashcard Session Complete <br> 
          <img src="ic_cancel_black_24px.svg" class="buttonsize"/>
        </div>
        <div class='timeout' id='timeout'></div> 
      </div> `
    $(that.el).html(html)
  }
 

  addCards(cards, forceSession=false) { 
    if (!Array.isArray(card)) card = [card]
    let newCards = cards.map( (card) => !this._cardFound(card) )
    newCards.forEach((card) => {
      card.level = 0
      card.schedule = this._today()
      this.cards[card.id] = card
    })
    if (forceSession) this.startSession(newCards.map(card => card.id)) 
  }
 
  newCard(content, type) {
    return {
      id: this._card_id(content, type),
      schedule: this._today(),
      level: 0,
      type: type,
      content: content
    }
  }

  _cardFound(card) {
    return this.cards[card.id] || this.history[card.id]
  }

  _card_id(content, type) {
    if (type==='vocab') {
      return type + '-' + _hash32(content.question + content.answer)
    } else if (type==='lang_vocab') {
      return type + '-' + _hash32(content.l1 + content.l2)
    } else if (type==='quote') {
      return type + '-' + _hash32(content.quote)
    }
  }

  // returns array of Card IDs scheduled for today or earlier
  _cardsDue() {
    let due = [], today = this._today() 
    //console.log('Today', today)
    for (var id in this.cards) {
      //console.log(Number(this.cards[id].schedule))
      if (this.cards[id].schedule <= today) due.push(id) 
    } 
    //console.log('Cards due: ', due)
    return due   
  }

  // numeric integer representing today
  _today() {
    return Math.round((new Date()).getTime() / (1000 * 360 * 24))
  }

  // reschedule card
  _rescheduleCard(card, session_passed=true) {
    const LEVELS = [1, 2, 4, 10, 25, 60, 150] // repetition intervals   
    let today = this._today()  
    if (session_passed) card.level++; else card.level=0
    if (card.level < LEVELS.length) card.schedule = today + LEVELS[card.level]
      else { // remove card and store reference
        delete(this.cards[id])
        this.history[id] = today
      }  
    this.cardsDue = this._cardsDue().length
  }

  // simple 32-bit numeric hash of any string
  _hash32(str) {
    var hash = 0;
    if (str.length == 0) return hash
    for (i = 0; i < str.length; i++) {
      char = str.charCodeAt(i);
      hash = ((hash<<5)-hash)+char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }
 
}

// quick array shuffle
var _shuffleArray = function (arr) {
  for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1))
      var temp = arr[i]
      arr[i] = arr[j]
      arr[j] = temp
  } 
  return arr
}
 
 
 
 

    
