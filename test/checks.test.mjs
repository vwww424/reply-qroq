import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkText, compileBanned, parseBannedList, sanitize, tweetLength } from '../src/checks.js';
import { DEFAULT_BANNED, DEFAULT_SETTINGS } from '../src/defaults.js';
import { parseJson } from '../src/api.js';

const s = { ...DEFAULT_SETTINGS };
const compiled = compileBanned(parseBannedList(DEFAULT_BANNED));
const ids = (text, settings = s) => checkText(text, settings, compiled).map((v) => v.id || v.type);

test('ловить заборонені слова з будь-яким закінченням і в кирилиці', () => {
  assert.deepEqual(ids('Давайте зануримось у тему'), ['banned']);
  assert.deepEqual(ids('Це неймовірний крок'), ['banned']);
  assert.deepEqual(ids("Важливо пам’ятати про це"), ['banned']); // типографський апостроф
  assert.deepEqual(ids('We should delve into it'), ['banned']);
  assert.deepEqual(ids('Ну це база, всі так роблять'), []);
});

test('не спрацьовує всередині інших слів', () => {
  assert.deepEqual(ids('подорожник росте біля дороги'), []);
  assert.deepEqual(ids('усвідомлення'), []);
});

test('ловить ШІ-конструкції', () => {
  assert.ok(ids('Це не просто інструмент, а ціла філософія').includes('not-just'));
  assert.ok(ids('Ну так — і що').includes('dash'));
  assert.ok(ids('Это прикол').includes('ru-letters'));
  assert.ok(ids('Чудовий пост, але ні').includes('compliment-open'));
  assert.ok(ids('Податки ростуть. А ви що думаєте?').includes('cta-end'));
  assert.ok(ids('Вау 🚀').includes('emoji'));
  assert.ok(!ids('Вау 🚀', { ...s, allowEmoji: true }).includes('emoji'));
});

test('довжина як у X', () => {
  assert.equal(tweetLength('привіт'), 6);
  assert.equal(tweetLength('ok 🚀'), 5);
  assert.equal(tweetLength('see https://example.com/very/long/path'), 4 + 23);
  assert.ok(ids('а'.repeat(281)).includes('length'));
});

test('sanitize: тире, лапки, хештеги, емодзі, @, нижній регістр', () => {
  assert.equal(sanitize('«Ну так — і що»', s), 'Ну так - і що');
  assert.equal(sanitize('@elon це смішно #AI #tech', s), 'це смішно');
  assert.equal(sanitize('Ракета 🚀 полетіла', s), 'Ракета полетіла');
  assert.equal(sanitize('Добре сказав.', { ...s, lowercase: true }), 'добре сказав');
});

test('parseJson рятує код-блоки і сміття навколо', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('ось: {"a":[1,2]} готово'), { a: [1, 2] });
  assert.throws(() => parseJson('нема json'));
});
