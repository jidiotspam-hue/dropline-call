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

test("does not match innocent substrings", () => {
  for (const text of [
    "class assignment",
    "classic bass guitar",
    "the ship is in port",
    "pass the butter",
    "cocktail hour"
  ]) {
    assert.equal(containsTrigger(text), false, text);
  }
});

test("returns individual leaderboard categories and repeated counts", () => {
  assert.deepEqual(detectTriggerCategories("fuck, shit, fucking, b****"), ["f", "s", "f", "b"]);
  assert.deepEqual(detectTriggerCategories("f u c k and s***"), ["f", "s"]);
});
