const { expect: jestExpect } = require('@jest/globals');
const {
  configureAccountDeletionMode,
  createDisposableTestUser,
  fetchUserData,
  launchQuietRoom,
  loginWithEmailCredentials,
  seedConversations,
} = require('./helpers');
const ids = require('./testIds');

jest.setTimeout(240000);

describe('Quiet Room account deletion', () => {
  beforeEach(async () => {
    await launchQuietRoom();
    await waitFor(element(by.id(ids.header))).toBeVisible().withTimeout(60000);
  });

  it('shows Delete Account in the profile menu and deletes the account end to end', async () => {
    const account = await createDisposableTestUser();

    await loginWithEmailCredentials(account);

    await seedConversations({
      uid: account.uid,
      token: account.token,
      count: 3,
    });

    await element(by.id(ids.profileButton)).tap();
    await waitFor(element(by.id(ids.profileMenu))).toExist().withTimeout(10000);
    await expect(element(by.id(ids.profileLogoutButton))).toExist();
    await expect(element(by.id(ids.profileDeleteButton))).toExist();

    await element(by.id(ids.profileDeleteButton)).tap();
    await waitFor(element(by.id(ids.deleteAccountModal))).toBeVisible().withTimeout(10000);
    await expect(element(by.text('Delete Account?'))).toBeVisible();
    await expect(element(by.text('Delete Account'))).toBeVisible();

    await element(by.id(ids.deleteAccountConfirmButton)).tap();

    await waitFor(element(by.id(ids.deleteAccountModal))).not.toExist().withTimeout(30000);
    await waitFor(element(by.id(ids.conversationsButton))).not.toExist().withTimeout(30000);

    await waitFor(element(by.id(ids.profileButton))).toExist().withTimeout(10000);
    await element(by.id(ids.profileButton)).tap();
    await waitFor(element(by.id(ids.profileSignInButton))).toExist().withTimeout(10000);

    await element(by.id(ids.profileSignInButton)).tap();
    await waitFor(element(by.id(ids.loginModal))).toBeVisible().withTimeout(10000);
    await element(by.id(ids.loginEmailInput)).replaceText(account.email);
    await element(by.id(ids.loginPasswordInput)).replaceText(account.password);
    await element(by.id(ids.loginSigninButton)).tap();
    await waitFor(element(by.id(ids.loginError))).toBeVisible().withTimeout(15000);
    await expect(element(by.id(ids.loginError))).toHaveText('Incorrect email or password.');
    await expect(element(by.id(ids.conversationsButton))).not.toExist();

    const userData = await fetchUserData({ uid: account.uid });
    jestExpect(userData.userExists).toBe(false);
    jestExpect(userData.conversationCount).toBe(0);
    jestExpect(userData.profileExists).toBe(false);
    jestExpect(userData.memoryCount).toBe(0);
  });

  it('shows a retryable error and keeps the user signed in when deletion fails', async () => {
    const account = await createDisposableTestUser();

    await configureAccountDeletionMode({
      uid: account.uid,
      mode: 'fail_once',
    });

    await loginWithEmailCredentials(account);

    await element(by.id(ids.profileButton)).tap();
    await waitFor(element(by.id(ids.profileDeleteButton))).toExist().withTimeout(10000);
    await element(by.id(ids.profileDeleteButton)).tap();

    await waitFor(element(by.id(ids.deleteAccountModal))).toBeVisible().withTimeout(10000);
    await element(by.id(ids.deleteAccountConfirmButton)).tap();

    await waitFor(element(by.id(ids.deleteAccountError))).toBeVisible().withTimeout(15000);
    await expect(element(by.text('Unable to delete account right now.'))).toBeVisible();

    await element(by.id(ids.deleteAccountCancelButton)).tap();
    await waitFor(element(by.id(ids.deleteAccountModal))).not.toExist().withTimeout(10000);

    await expect(element(by.id(ids.conversationsButton))).toExist();

    const userData = await fetchUserData({ uid: account.uid });
    jestExpect(userData.userExists).toBe(true);
  });
});
