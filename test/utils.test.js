import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { cache, slackClient } from "../src/cache.js";
import { resolveTargetUser } from "../src/utils.js";

/**
 * These tests are all AI-generated, but have been thoroughly reviewed.
 */

const slackUser = (id, name, realName, extra = {}) => ({
  id,
  name,
  real_name: realName,
  profile: { display_name: realName },
  ...extra,
});

const ALICE = slackUser("U0AAAAAAAA1", "alicebrown", "Alice Brown");
const ALICIA = slackUser("U0AAAAAAAA2", "aliciagrant", "Alicia Grant");
const BOB = slackUser("U0AAAAAAAA3", "bob", "Bob Lane");
const BOBBY = slackUser("U0AAAAAAAA4", "bobby", "Bobby Smith");
const CAROL = slackUser("U0AAAAAAAA5", "carol", "Carol Hanson");
const BOT = slackUser("U0AAAAAAAA6", "alicebot", "Alice Bot", { is_bot: true });
const DELETED = slackUser("U0AAAAAAAA7", "aliceold", "Alice Old", { deleted: true });

const ALL_USERS = [ALICE, ALICIA, BOB, BOBBY, CAROL, BOT, DELETED];

/** Fake Bolt client whose users.info looks users up in ALL_USERS. */
const fakeClient = () => ({
  users: {
    info: mock.fn(async ({ user }) => {
      const found = ALL_USERS.find((u) => u.id === user);
      return found ? { ok: true, user: found } : { ok: false };
    }),
  },
});

/** Captures ephemeral responses sent by resolveTargetUser. */
const fakeRespond = () => {
  const respond = mock.fn(async () => {});
  respond.lastText = () => respond.mock.calls.at(-1)?.arguments[0].text;
  return respond;
};

let listStub;

beforeEach(() => {
  cache.slackUsers = [...ALL_USERS];
  // Stub the Slack API so refreshSlackUsersCache never hits the network
  listStub = mock.method(slackClient.users, "list", async () => ({
    members: ALL_USERS,
    response_metadata: {},
  }));
});

afterEach(() => {
  mock.restoreAll();
});

describe("resolveTargetUser", () => {
  describe("mentions and IDs", () => {
    it("resolves an HTML-escaped Slack mention without searching", async () => {
      const client = fakeClient();
      const result = await resolveTargetUser(
        `&lt;@${ALICE.id}|alicebrown&gt;`,
        client,
        fakeRespond()
      );
      assert.equal(result.targetUserId, ALICE.id);
      assert.equal(listStub.mock.callCount(), 0);
    });

    it("resolves a mention without a label", async () => {
      const result = await resolveTargetUser(`<@${ALICE.id}>`, fakeClient(), fakeRespond());
      assert.equal(result.targetUserId, ALICE.id);
    });

    it("resolves a bare user ID", async () => {
      const result = await resolveTargetUser(ALICE.id, fakeClient(), fakeRespond());
      assert.equal(result.targetUserId, ALICE.id);
    });

    it("does not pull a mention out of surrounding text", async () => {
      const respond = fakeRespond();
      const result = await resolveTargetUser(`hey <@${ALICE.id}>`, fakeClient(), respond);
      assert.equal(result, null);
      assert.match(respond.lastText(), /Could not find a member/);
    });
  });

  describe("name search", () => {
    it("resolves a unique partial name", async () => {
      const result = await resolveTargetUser("brown", fakeClient(), fakeRespond());
      assert.equal(result.targetUserId, ALICE.id);
    });

    it("strips a leading @ from plain-text names", async () => {
      const result = await resolveTargetUser("@Alice Brown", fakeClient(), fakeRespond());
      assert.equal(result.targetUserId, ALICE.id);
    });

    it("prefers an exact match over partial matches", async () => {
      // "bob" is also a substring of "bobby", but Bob's username is an exact match
      const result = await resolveTargetUser("bob", fakeClient(), fakeRespond());
      assert.equal(result.targetUserId, BOB.id);
    });

    it("rejects ambiguous names instead of picking the first match", async () => {
      const client = fakeClient();
      const respond = fakeRespond();
      const result = await resolveTargetUser("an", client, respond);

      assert.equal(result, null);
      assert.match(respond.lastText(), /matches multiple members/);
      assert.match(respond.lastText(), new RegExp(ALICIA.id));
      assert.match(respond.lastText(), new RegExp(BOB.id));
      assert.match(respond.lastText(), new RegExp(CAROL.id));
      assert.equal(client.users.info.mock.callCount(), 0);
    });

    it("ignores bots and deleted users", async () => {
      // "alic" partially matches Alice, Alicia, the bot and the deleted user;
      // only the two active humans should be considered
      const respond = fakeRespond();
      await resolveTargetUser("alic", fakeClient(), respond);
      assert.match(respond.lastText(), new RegExp(ALICE.id));
      assert.match(respond.lastText(), new RegExp(ALICIA.id));
      assert.doesNotMatch(respond.lastText(), new RegExp(BOT.id));
      assert.doesNotMatch(respond.lastText(), new RegExp(DELETED.id));
    });

    it("does not refresh the cache when the name is found", async () => {
      await resolveTargetUser("bob", fakeClient(), fakeRespond());
      assert.equal(listStub.mock.callCount(), 0);
    });
  });

  describe("stale cache", () => {
    it("refreshes the Slack users cache once and resolves a newly joined member", async () => {
      cache.slackUsers = ALL_USERS.filter((u) => u !== ALICE); // loaded before Alice joined

      const result = await resolveTargetUser("Alice Brown", fakeClient(), fakeRespond());

      assert.equal(result.targetUserId, ALICE.id);
      assert.equal(listStub.mock.callCount(), 1);
    });

    it("refreshes only once for an unknown name, then rejects", async () => {
      const respond = fakeRespond();
      const result = await resolveTargetUser("nobody", fakeClient(), respond);

      assert.equal(result, null);
      assert.equal(listStub.mock.callCount(), 1);
      assert.match(respond.lastText(), /Could not find a member matching \*nobody\*/);
    });
  });

  describe("invalid input", () => {
    it("rejects empty input", async () => {
      const respond = fakeRespond();
      assert.equal(await resolveTargetUser("", fakeClient(), respond), null);
      assert.equal(respond.lastText(), "No member specified.");
    });

    it("does not treat a lone @ as matching everyone", async () => {
      const respond = fakeRespond();
      assert.equal(await resolveTargetUser("@", fakeClient(), respond), null);
      assert.match(respond.lastText(), /Could not find a member/);
    });

    it("rejects a mentioned user that Slack reports as deleted", async () => {
      const respond = fakeRespond();
      const result = await resolveTargetUser(`<@${DELETED.id}>`, fakeClient(), respond);
      assert.equal(result, null);
      assert.match(respond.lastText(), /deleted users/);
    });
  });
});
