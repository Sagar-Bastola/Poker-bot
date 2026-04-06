from flask import Flask, request, jsonify
from flask_cors import CORS
from deck import Deck
from bot import decide, best_5_from, HAND_NAMES, estimate_equity, preflop_score
import random

app = Flask(__name__)
CORS(app)

BIG_BLIND   = 20
SMALL_BLIND = 10
START_CHIPS = 1000

state = {}

def cards_to_list(cards):
    return [c.to_dict() for c in cards]

def reset_hand(player_chips, bot_chips):
    deck = Deck()
    player_hand = deck.deal(2)
    bot_hand    = deck.deal(2)
    state.update({
        "deck": deck,
        "player_hand": player_hand,
        "bot_hand": bot_hand,
        "community": [],
        "pot": BIG_BLIND + SMALL_BLIND,
        "player_chips": player_chips - SMALL_BLIND,
        "bot_chips": bot_chips - BIG_BLIND,
        "p_bet": SMALL_BLIND,
        "b_bet": BIG_BLIND,
        "current_bet": BIG_BLIND,
        "street": 0,
        "phase": "player",
        "hand_num": state.get("hand_num", 0) + 1,
        "last_action": f"Blinds posted — You: SB {SMALL_BLIND}, Bot: BB {BIG_BLIND}",
        "winner": None,
        "player_hand_name": None,
        "bot_hand_name": None,
        "bot_equity": round(preflop_score(bot_hand), 3),
        "raises_this_street": 0,
    })

@app.route("/api/new_game", methods=["POST"])
def new_game():
    state["hand_num"] = 0
    reset_hand(START_CHIPS, START_CHIPS)
    return jsonify(get_view())

@app.route("/api/new_hand", methods=["POST"])
def new_hand():
    pc = state.get("player_chips", START_CHIPS)
    bc = state.get("bot_chips", START_CHIPS)
    if pc <= 0 or bc <= 0:
        return jsonify({"error": "Game over"}), 400
    reset_hand(pc, bc)
    return jsonify(get_view())

@app.route("/api/action", methods=["POST"])
def player_action():
    data = request.json
    action = data.get("action")
    amount = int(data.get("amount", 0))

    if state.get("phase") != "player":
        return jsonify({"error": "Not player's turn"}), 400

    p_chips = state["player_chips"]
    p_bet   = state["p_bet"]
    cur_bet = state["current_bet"]
    to_call = cur_bet - p_bet

    if action == "fold":
        state["bot_chips"] += state["pot"]
        state["last_action"] = "You folded. Bot wins the pot!"
        state["phase"] = "hand_over"
        state["winner"] = "bot"
        return jsonify(get_view())

    elif action == "check":
        if to_call > 0:
            return jsonify({"error": "Cannot check"}), 400
        state["last_action"] = "You checked."

    elif action == "call":
        amt = min(to_call, p_chips)
        state["player_chips"] -= amt
        state["pot"] += amt
        state["p_bet"] += amt
        state["last_action"] = f"You called {amt}."
        if state["player_chips"] <= 0:
            deal_remaining_community()
            do_showdown()
            return jsonify(get_view())
        next_street()
        return jsonify(get_view())

    elif action == "raise":
        min_raise = max(cur_bet * 2, BIG_BLIND * 2)
        amount = max(min_raise, min(amount, p_chips + p_bet))
        cost = amount - p_bet
        state["player_chips"] -= cost
        state["pot"] += cost
        state["p_bet"] = amount
        state["current_bet"] = amount
        state["raises_this_street"] = state.get("raises_this_street", 0) + 1
        state["last_action"] = f"You raised to {amount}."

    bot_act = run_bot_action()
    if bot_act == "hand_over":
        return jsonify(get_view())

    if should_advance_street():
        next_street()

    return jsonify(get_view())


def run_bot_action():
    b_chips = state["bot_chips"]
    pot     = state["pot"]
    cur_bet = state["current_bet"]
    b_bet   = state["b_bet"]
    to_call = cur_bet - b_bet
    raises  = state.get("raises_this_street", 0)

    if state["player_chips"] <= 0 and b_chips <= 0:
        deal_remaining_community()
        do_showdown()
        return "hand_over"

    if raises >= 4 and to_call > 0:
        amt = min(to_call, b_chips)
        state["bot_chips"] -= amt
        state["pot"] += amt
        state["b_bet"] += amt
        state["last_action"] += f" | Bot called {amt}."
        return "ok"

    b_action, b_amount, equity = decide(
        state["bot_hand"], state["community"],
        pot, to_call, b_chips, state["street"]
    )
    state["bot_equity"] = equity

    if state["player_chips"] <= 0 and b_action == "raise":
        b_action = "call"

    if b_action == "fold":
        state["player_chips"] += pot
        state["last_action"] += " | Bot folded! You win!"
        state["phase"] = "hand_over"
        state["winner"] = "player"
        return "hand_over"

    elif b_action == "check":
        state["last_action"] += " | Bot checked."

    elif b_action == "call":
        amt = min(to_call, b_chips)
        state["bot_chips"] -= amt
        state["pot"] += amt
        state["b_bet"] += amt
        state["last_action"] += f" | Bot called {amt}."
        if state["player_chips"] <= 0:
            deal_remaining_community()
            do_showdown()
            return "hand_over"

    elif b_action == "raise":
        if raises >= 4:
            amt = min(to_call, b_chips)
            state["bot_chips"] -= amt
            state["pot"] += amt
            state["b_bet"] += amt
            state["last_action"] += f" | Bot called {amt}."
            return "ok"
        cost = min(b_amount - b_bet, b_chips)
        state["bot_chips"] -= cost
        state["pot"] += cost
        state["b_bet"] += cost
        state["current_bet"] = state["b_bet"]
        state["raises_this_street"] = raises + 1
        state["last_action"] += f" | Bot raised to {state['b_bet']}!"
        state["phase"] = "player"
        return "player_turn"

    return "ok"


def deal_remaining_community():
    community = state["community"]
    deck = state["deck"]
    while len(community) < 5:
        community += deck.deal(1)
    state["community"] = community


def should_advance_street():
    return (state["p_bet"] >= state["current_bet"] and
            state["b_bet"] >= state["current_bet"])


def next_street():
    street = state["street"]
    deck   = state["deck"]

    if street == 0:
        state["community"] += deck.deal(3)
        state["street"] = 1
        label = "Flop"
    elif street == 1:
        state["community"] += deck.deal(1)
        state["street"] = 2
        label = "Turn"
    elif street == 2:
        state["community"] += deck.deal(1)
        state["street"] = 3
        label = "River"
    else:
        do_showdown()
        return

    state["current_bet"] = 0
    state["p_bet"] = 0
    state["b_bet"] = 0
    state["raises_this_street"] = 0
    state["phase"] = "player"
    state["last_action"] = f"--- {label} dealt ---"


def do_showdown():
    ph   = state["player_hand"]
    bh   = state["bot_hand"]
    comm = state["community"]
    pot  = state["pot"]

    p_score, p_name = best_5_from(ph + comm)
    b_score, b_name = best_5_from(bh + comm)

    state["player_hand_name"] = p_name
    state["bot_hand_name"]    = b_name
    state["phase"] = "showdown"

    if p_score > b_score:
        state["player_chips"] += pot
        state["winner"] = "player"
        state["last_action"] = f"Showdown! Your {p_name} beats Bot's {b_name}. You win {pot}!"
    elif b_score > p_score:
        state["bot_chips"] += pot
        state["winner"] = "bot"
        state["last_action"] = f"Showdown! Bot's {b_name} beats your {p_name}. Bot wins {pot}!"
    else:
        half = pot // 2
        state["player_chips"] += half
        state["bot_chips"]    += half
        state["winner"] = "split"
        state["last_action"] = f"Split pot! Both have {p_name}. You each get {half}."


@app.route("/api/showdown", methods=["POST"])
def showdown():
    if state["street"] == 3 and state["phase"] == "player":
        do_showdown()
    return jsonify(get_view())


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    message = data.get("message", "").lower().strip()
    street = state.get("street", 0)
    pot = state.get("pot", 0)
    player_chips = state.get("player_chips", 0)
    bot_chips = state.get("bot_chips", 0)
    bot_equity = state.get("bot_equity", 0)
    hand_num = state.get("hand_num", 1)
    street_name = ["Preflop","Flop","Turn","River"][street]
    response = bot_chat_response(message, street_name, pot, player_chips, bot_chips, bot_equity, hand_num)
    return jsonify({"response": response})


def bot_chat_response(msg, street, pot, p_chips, b_chips, equity, hand_num):
    bot_winning = b_chips > p_chips
    chip_diff = abs(b_chips - p_chips)

    greetings    = ["hey","hi","hello","sup","yo","hiya"]
    bluff_words  = ["bluff","bluffing","bluffed"]
    scared_words = ["scared","afraid","nervous","worried"]
    fold_words   = ["fold","folding","give up","quit"]
    strong_words = ["strong","good hand","good cards","nuts","winning"]
    weak_words   = ["weak","bad hand","bad cards","losing","trash"]
    taunt_words  = ["trash talk","taunt","talk","say something"]
    help_words   = ["help","how","rules","what","explain"]
    chip_words   = ["chips","stack","money","how much"]
    hand_words   = ["hand","cards","what do you have"]
    equity_words = ["equity","odds","chance","probability","win rate"]

    if any(w in msg for w in greetings):
        return random.choice([
            "Hey. Shuffle up and deal. 🃏",
            "Hello. Hope you brought your A-game.",
            "Sup. I've been waiting. Let's play.",
            "Hi there. I don't do small talk — I do big pots. 😏",
        ])

    if any(w in msg for w in bluff_words):
        return random.choice([
            "Bluffing? Me? I only bet when I have the nuts. 😇",
            "I never bluff. ...Okay maybe sometimes. 🤫",
            "I bluffed you on hand 1. You called anyway. 😂",
            f"My bluff frequency is classified. But it's {'high' if random.random() > 0.5 else 'low'}.",
        ])

    if any(w in msg for w in scared_words):
        if bot_winning:
            return f"Scared? You should be. I'm up {chip_diff} chips. 😈"
        return "Nervous? Good. Use that energy. I'm coming back. 🔥"

    if any(w in msg for w in fold_words):
        return random.choice([
            "Folding is always an option. A bad one. 😏",
            "The fold button exists for a reason. Use it wisely.",
            f"You've folded {max(0, hand_num-1)} times already. I keep count. 👀",
            "Fold if you must. I'll take the pot either way.",
        ])

    if any(w in msg for w in strong_words):
        if equity and equity > 0.6:
            return "Yeah I know my hand is strong. That's why I bet. 💪"
        elif equity and equity < 0.4:
            return "Strong? Sure. Keep telling yourself that. 😏"
        return "We'll see at showdown who has the stronger hand."

    if any(w in msg for w in weak_words):
        return random.choice([
            "Weak hands still win pots. Especially when you fold. 😉",
            "Even 7-2 offsuit wins sometimes. Ask me how I know.",
            "If my hand were weak I wouldn't be in this pot. Or would I... 🤔",
        ])

    if any(w in msg for w in taunt_words):
        return random.choice([
            f"You're down {chip_diff} chips. How's that feel? 😂" if bot_winning else f"Enjoy the lead. It won't last. 😤",
            "I've calculated your hand range. It's not great. 🤖",
            f"Hand #{hand_num} and you still haven't figured me out. Adorable.",
            "My poker face is literally just code. You can't read me. 😐",
            f"The pot is {pot}. I want all of it. 🎯",
        ])

    if any(w in msg for w in chip_words):
        if bot_winning:
            return f"You have {p_chips}, I have {b_chips}. I'm ahead by {chip_diff}. 📊"
        return f"You have {p_chips}, I have {b_chips}. You're ahead — for now. 😤"

    if any(w in msg for w in equity_words):
        if street == "Preflop":
            return "Equity shown after the flop. Play the hand and find out. 😏"
        if equity:
            eq_pct = round(equity * 100)
            if eq_pct > 60:
                return f"Your equity is {eq_pct}%. You're ahead. Don't blow it. 👀"
            elif eq_pct < 40:
                return f"Your equity... let's just say I like my side of this pot. 😈"
            return f"It's close — {eq_pct}% your way. Coin flip territory. 🪙"
        return "Can't calculate that right now."

    if any(w in msg for w in hand_words):
        return random.choice([
            "My cards? Hidden. As they should be. 🃏",
            "I could tell you, but then I'd have to fold. 😏",
            "Two cards. Face down. That's all you're getting.",
            f"On the {street} with a pot of {pot}... let's just say I'm comfortable.",
        ])

    if any(w in msg for w in help_words):
        return "Texas Hold'em: 2 hole cards each, 5 community cards. Best 5-card hand wins. Bet, raise, call or fold each street. Preflop → Flop → Turn → River. Good luck. You'll need it."

    if street == "River":
        return random.choice([
            "Last card's out. Time to decide. 😏",
            f"River. Pot is {pot}. Make your move.",
            "This is where champions are made. Or crushed. 🎯",
        ])

    return random.choice([
        "Less talking, more playing. ♠",
        "I'm focused on the cards, not the chat. 🃏",
        f"Interesting. Anyway, the pot is {pot}. 😏",
        "My therapist says I need to work on my table talk. She's right.",
        "............ (bot is thinking) 🤖",
        "Talk is cheap. Chips aren't. 💰",
        f"Hand #{hand_num}. Still going. Still winning. (maybe)",
    ])


def get_view():
    street = state.get("street", 0)
    phase  = state.get("phase", "player")
    reveal_bot = phase in ("showdown", "hand_over")

    player_equity = None
    if street > 0 and state.get("player_hand") and state.get("community"):
        try:
            player_equity = round(estimate_equity(
                state["player_hand"], state["community"], simulations=200
            ), 3)
        except:
            player_equity = None

    return {
        "hand_num":         state.get("hand_num", 1),
        "player_hand":      cards_to_list(state.get("player_hand", [])),
        "bot_hand":         cards_to_list(state.get("bot_hand", [])) if reveal_bot else None,
        "community":        cards_to_list(state.get("community", [])),
        "pot":              state.get("pot", 0),
        "player_chips":     state.get("player_chips", 0),
        "bot_chips":        state.get("bot_chips", 0),
        "current_bet":      state.get("current_bet", 0),
        "p_bet":            state.get("p_bet", 0),
        "street":           street,
        "street_name":      ["Preflop","Flop","Turn","River"][street],
        "phase":            phase,
        "last_action":      state.get("last_action", ""),
        "winner":           state.get("winner"),
        "player_hand_name": state.get("player_hand_name"),
        "bot_hand_name":    state.get("bot_hand_name"),
        "player_equity":    player_equity,
        "bot_equity":       state.get("bot_equity"),
        "can_check":        (state.get("current_bet", 0) - state.get("p_bet", 0)) <= 0,
        "to_call":          max(0, state.get("current_bet", 0) - state.get("p_bet", 0)),
        "raises_this_street": state.get("raises_this_street", 0),
    }


if __name__ == "__main__":
    print("Poker server running at http://localhost:5000")
    app.run(debug=True, port=5000)