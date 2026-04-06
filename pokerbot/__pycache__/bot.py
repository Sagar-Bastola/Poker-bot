import random
from itertools import combinations
from deck import RANK_VALUE, Deck

def get_rank_counts(cards):
    counts = {}
    for c in cards:
        counts[c.rank] = counts.get(c.rank, 0) + 1
    return counts

def get_flush_suit(cards):
    from collections import Counter
    suits = Counter(c.suit for c in cards)
    for s, v in suits.items():
        if v >= 5:
            return s
    return None

def is_straight(cards):
    vals = sorted(set(RANK_VALUE[c.rank] for c in cards))
    for i in range(len(vals) - 4):
        if vals[i+4] - vals[i] == 4:
            return True
    if set([0,1,2,3,12]).issubset(set(vals)):
        return True
    return False

def hand_rank(cards):
    counts = get_rank_counts(cards)
    freq = sorted(counts.values(), reverse=True)
    flush_suit = get_flush_suit(cards)
    flush_cards = [c for c in cards if c.suit == flush_suit] if flush_suit else []
    flush = bool(flush_suit)
    straight = is_straight(cards)
    sf = flush and is_straight(flush_cards)

    if sf:             return 8
    if freq[0] == 4:   return 7
    if freq[0] == 3 and freq[1] >= 2: return 6
    if flush:          return 5
    if straight:       return 4
    if freq[0] == 3:   return 3
    if freq[0] == 2 and freq[1] == 2: return 2
    if freq[0] == 2:   return 1
    return 0

HAND_NAMES = [
    'High Card','One Pair','Two Pair','Three of a Kind',
    'Straight','Flush','Full House','Four of a Kind','Straight Flush'
]

def best_5_from(cards):
    best_score = -1
    best_combo = None
    for combo in combinations(cards, 5):
        s = hand_rank(list(combo))
        if s > best_score:
            best_score = s
            best_combo = list(combo)
    return best_score, HAND_NAMES[best_score] if best_score >= 0 else "High Card"

def estimate_equity(hole, community, simulations=500):
    wins = ties = 0
    used = set((c.rank, c.suit) for c in hole + community)

    for _ in range(simulations):
        d = Deck()
        remaining = [c for c in d.cards if (c.rank, c.suit) not in used]
        random.shuffle(remaining)

        needed = 5 - len(community)
        extra = remaining[:needed]
        opp_hole = remaining[needed:needed + 2]

        if len(opp_hole) < 2:
            continue

        full_board = community + extra
        my_score, _ = best_5_from(hole + full_board)
        opp_score, _ = best_5_from(opp_hole + full_board)

        if my_score > opp_score:
            wins += 1
        elif my_score == opp_score:
            ties += 1

    return (wins + ties * 0.5) / max(simulations, 1)

def preflop_score(hole):
    r0 = RANK_VALUE[hole[0].rank]
    r1 = RANK_VALUE[hole[1].rank]
    hi, lo = max(r0, r1), min(r0, r1)
    suited = hole[0].suit == hole[1].suit
    pair   = hole[0].rank == hole[1].rank
    score  = hi * 2 + lo
    if pair:   score += hi * 3
    if suited: score += 5
    if hi - lo <= 2 and not pair: score += 4
    return min(score / 60.0, 1.0)

def decide(hole, community, pot, to_call, stack, street, aggression=1.0):
    if street == 0:
        equity = preflop_score(hole)
    else:
        equity = estimate_equity(hole, community, simulations=400)

    can_check = (to_call == 0)
    pot_odds = to_call / (pot + to_call + 1e-9) if to_call > 0 else 0

    bluffing = equity < 0.3 and random.random() < 0.18 * aggression
    effective = equity if not bluffing else 0.65

    if effective > 0.60 * (1 / aggression):
        if can_check:
            bet = max(int(pot * 0.75 * aggression), 20)
            return ('raise', min(bet, stack), round(equity, 3))
        else:
            if effective > 0.78:
                raise_to = min(int(to_call * 2.5 + pot * 0.4), stack)
                return ('raise', max(raise_to, to_call + 1), round(equity, 3))
            else:
                return ('call', to_call, round(equity, 3))

    elif effective > 0.40:
        if can_check:
            if equity > 0.50:
                bet = int(pot * 0.45)
                return ('raise', min(max(bet, 10), stack), round(equity, 3))
            return ('check', 0, round(equity, 3))
        elif effective > pot_odds + 0.06:
            return ('call', to_call, round(equity, 3))
        else:
            return ('fold', 0, round(equity, 3))

    else:
        if can_check:
            return ('check', 0, round(equity, 3))
        return ('fold', 0, round(equity, 3))