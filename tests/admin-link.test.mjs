// The owner link: an opaque token that cannot be read, forged or reused past
// its expiry without ADMIN_LINK_SECRET.
import test from "node:test";
import assert from "node:assert/strict";
import { accessTokenIsValid, createAccessLinkToken } from "../lib/admin/link.js";

const secret = "link-secret-for-tests-".repeat(2);

test("a link is opaque, url-safe and never repeats", async () => {
  const token = await createAccessLinkToken(secret, null);
  assert.match(token, /^[A-Za-z0-9_-]+$/, "safe in a URL without escaping");
  assert.notEqual(await createAccessLinkToken(secret, null), token, "a fresh nonce every time");
  // Nothing about the link is readable: no date, no marker, no plain text.
  const decoded = Buffer.from(token, "base64url").toString("latin1");
  assert.ok(!/expiresAt|nonce|chichkhan/.test(decoded));
});

test("only a link made with this secret, and still in date, opens anything", async () => {
  assert.equal(await accessTokenIsValid(secret, await createAccessLinkToken(secret, null)), true, "no expiry");
  assert.equal(await accessTokenIsValid(secret, await createAccessLinkToken(secret, Date.now() + 60_000)), true);
  assert.equal(await accessTokenIsValid(secret, await createAccessLinkToken(secret, Date.now() - 1)), false, "expired");
  assert.equal(await accessTokenIsValid("a completely different secret!!", await createAccessLinkToken(secret, null)), false);

  // Every byte is authenticated, so an edited token is not a near miss.
  const token = await createAccessLinkToken(secret, null);
  for (const forged of [token.slice(0, -2) + "AA", "A" + token.slice(1), token.slice(1), token.toUpperCase()]) {
    if (forged !== token) assert.equal(await accessTokenIsValid(secret, forged), false, forged.slice(0, 10));
  }
  for (const junk of ["", " ", "null", "../../etc/passwd", "a".repeat(600), null, undefined, 42, {}]) {
    assert.equal(await accessTokenIsValid(secret, junk), false, String(junk));
  }
  assert.equal(await accessTokenIsValid("", await createAccessLinkToken(secret, null)), false, "no secret, no access");
});

test("a link cannot be made without a secret", async () => {
  await assert.rejects(createAccessLinkToken("", null), /ADMIN_LINK_SECRET/);
});
