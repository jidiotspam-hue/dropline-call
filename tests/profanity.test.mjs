import assert from "node:assert/strict";
import test from "node:test";
import { containsTrigger, detectTriggerCategories } from "../profanity.js";

test("detects ordinary and inflected trigger phrases", () => {
  for (const text of [
    "what the fuck",
    "this is fucking wild",
    "that was shitty",
    "you absolute asshole",
    "mother fucker",
    "damn, really?"
  ]) {
    assert.equal(containsTrigger(text), true, text);
  }
});

test("detects recognizer-masked and spelled-out variants", () => {
  for (const text of [
    "what the f***",
    "this is f***ing wild",
    "holy s***",
    "you b****",
    "what the f word",
    "f u c k that"
  ]) {
    assert.equal(containsTrigger(text), true, text);
  }
});

test("detects compounds recognizers return as one word", () => {
  for (const text of [
    "oh my god that is such bullshit",
    "what the hell are you doing you dumbass",
    "get out of here jackass",
    "quit shitposting",
    "you absolute motherfucker",
    "stop being such a dickhead",
    "that is horseshit"
  ]) {
    assert.equal(containsTrigger(text), true, text);
  }
});

test("matches the split spellings recognizers also produce", () => {
  assert.deepEqual(detectTriggerCategories("what the hell are you doing you dumb ass"), ["a"]);
  assert.deepEqual(detectTriggerCategories("oh my god that is such bull shit"), ["s"]);
  assert.deepEqual(detectTriggerCategories("son of a bitch i lost again"), ["b"]);
  assert.deepEqual(detectTriggerCategories("this game is so damn hard"), ["d"]);
});

test("does not match innocent substrings", () => {
  for (const text of [
    "class assignment",
    "classic bass guitar",
    "the ship is in port",
    "pass the butter",
    "cocktail hour",
    "the assassin dictates the assignment",
    "a peacock in the cockpit",
    "grass and brass and molasses",
    "that was a really bad play you idiot"
  ]) {
    assert.equal(containsTrigger(text), false, text);
  }
});

test("returns individual leaderboard categories and repeated counts", () => {
  assert.deepEqual(detectTriggerCategories("fuck, shit, fucking, b****"), ["f", "s", "f", "b"]);
  assert.deepEqual(detectTriggerCategories("f u c k and s***"), ["f", "s"]);
});
