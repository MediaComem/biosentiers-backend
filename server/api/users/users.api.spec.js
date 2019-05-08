const _ = require('lodash');
const chance = require('chance').Chance();
const expect = require('chai').expect;
const expectRes = require('../../spec/expectations/response');
const expectUser = require('../../spec/expectations/user');
const jwt = require('../../lib/jwt');
const moment = require('moment');
const spec = require('../../spec/utils');
const User = require('../../models/user');
const userFixtures = require('../../spec/fixtures/user');

spec.setUpMocha();

describe('Users API', function() {

  let data;
  beforeEach(function() {
    data = {};
  });

  /**
   * POST /api/users
   *
   * Tests for user creation by an admin or with an invitation JWT.
   */
  describe('POST /api/users', function() {
    beforeEach(function() {
      return spec.setUp(data, () => {

        const firstName = userFixtures.firstName();
        const lastName = userFixtures.lastName();

        data.reqBody = {
          firstName: firstName,
          lastName: lastName,
          email: userFixtures.email(firstName, lastName),
          password: userFixtures.password()
        };
      });
    });

    it('should deny anonymous access', async function() {
      return spec
        .testApi('POST', '/users', data.reqBody)
        .then(expectRes.unauthorized({
          code: 'auth.missingAuthorization',
          message: 'Authentication is required to access this resource. Authenticate by providing a Bearer token in the Authorization header.'
        }));
    });

    it('should deny access to a user', async function() {
      const user = await userFixtures.user();
      return spec
        .testApi('POST', '/users', data.reqBody)
        .set('Authorization', `Bearer ${user.generateJwt()}`)
        .then(expectRes.forbidden({
          code: 'auth.forbidden',
          message: 'You are not authorized to access this resource. Authenticate with a user account that has more privileges.'
        }));
    });

    it('should deny access with a password reset token', async function() {
      const user = await userFixtures.user();
      return spec
        .testApi('POST', '/users', data.reqBody)
        .set('Authorization', `Bearer ${generatePasswordResetToken(user)}`)
        .then(expectRes.unauthorized({
          code: 'auth.invalidAuthorization',
          message: 'The Bearer token supplied in the Authorization header is invalid or has expired.'
        }));
    });

    describe('as an admin', function() {
      beforeEach(function() {
        return spec.setUp(data, () => {
          data.admin = userFixtures.admin();
        });
      });

      it('should create a user', function() {

        const expected = _.defaults({
          active: false,
          role: 'user',
          loginCount: 0,
          createdJustAfter: data.afterSetup,
          updatedAt: 'createdAt'
        }, data.reqBody);

        return spec
          .testCreate('/users', data.reqBody)
          .set('Authorization', `Bearer ${data.admin.generateJwt()}`)
          .then(expectUser.inBody(expected));
      });

      it('should create an admin user', function() {

        data.reqBody.active = true;
        data.reqBody.role = 'admin';

        const expected = _.defaults({
          loginCount: 0,
          createdJustAfter: data.afterSetup,
          updatedAt: 'createdAt'
        }, data.reqBody);

        return spec
          .testCreate('/users', data.reqBody)
          .set('Authorization', `Bearer ${data.admin.generateJwt()}`)
          .then(expectUser.inBody(expected));
      });

      it('should not accept invalid properties', function() {

        const body = {
          firstName: '',
          lastName: 4,
          active: 42,
          email: 'foo'
        };

        return spec
          .testApi('POST', '/users')
          .set('Authorization', `Bearer ${data.admin.generateJwt()}`)
          .send(body)
          .then(expectRes.invalid([
            {
              message: 'must not be blank',
              type: 'json',
              location: '/firstName',
              validator: 'notBlank',
              value: '',
              valueSet: true
            },
            {
              message: 'must be of type string',
              type: 'json',
              location: '/lastName',
              validator: 'type',
              types: [ 'string' ],
              value: 4,
              valueSet: true
            },
            {
              message: 'must be of type boolean',
              type: 'json',
              location: '/active',
              validator: 'type',
              types: [ 'boolean' ],
              value: 42,
              valueSet: true
            },
            {
              message: 'is required',
              type: 'json',
              location: '/password',
              validator: 'required',
              valueSet: false
            },
            {
              message: 'must be a valid e-mail address',
              type: 'json',
              location: '/email',
              validator: 'email',
              value: 'foo',
              valueSet: true
            }
          ]));
      });
    });

    describe('as an invited user', function() {
      it('should create a user', async function() {

        const invitation = await generateInvitationToken();

        const expected = _.defaults({
          active: true,
          role: 'user',
          createdJustAfter: data.afterSetup,
          updatedAt: 'createdAt'
        }, data.reqBody);

        return spec
          .testCreate('/users', data.reqBody)
          .set('Authorization', `Bearer ${invitation}`)
          .then(expectUser.inBody(expected));
      });

      it('should create an admin user', async function() {

        const invitation = await generateInvitationToken({
          role: 'admin'
        });

        const expected = _.defaults({
          active: true,
          role: 'admin',
          loginCount: 0,
          createdJustAfter: data.afterSetup,
          updatedAt: 'createdAt'
        }, data.reqBody);

        return spec
          .testCreate('/users', data.reqBody)
          .set('Authorization', `Bearer ${invitation}`)
          .then(expectUser.inBody(expected));
      });

      it('should create a user with the first and last name in the invitation token by default', async function() {

        const firstName = userFixtures.firstName();
        const lastName = userFixtures.lastName();
        const invitation = await generateInvitationToken({
          firstName: firstName,
          lastName: lastName
        });

        data.reqBody = _.omit(data.reqBody, 'firstName', 'lastName');

        const expected = _.defaults({
          firstName: firstName,
          lastName: lastName,
          active: true,
          role: 'user',
          createdJustAfter: data.afterSetup,
          updatedAt: 'createdAt'
        }, data.reqBody);

        return spec
          .testCreate('/users', data.reqBody)
          .set('Authorization', `Bearer ${invitation}`)
          .then(expectUser.inBody(expected));
      });

      it('should accept unchanged admin properties', async function() {

        const invitation = await generateInvitationToken();

        _.extend(data.reqBody, {
          active: true,
          email: data.reqBody.email,
          role: 'user'
        });

        const expected = _.defaults({
          active: true,
          role: 'user',
          createdJustAfter: data.afterSetup,
          updatedAt: 'createdAt'
        }, data.reqBody);

        return spec
          .testCreate('/users', data.reqBody)
          .set('Authorization', `Bearer ${invitation}`)
          .then(expectUser.inBody(expected));
      });

      it('should not accept invalid properties', async function() {

        const invitation = await generateInvitationToken();

        const body = {
          firstName: null,
          lastName: chance.string({ length: 21 }),
          password: '   '
        };

        return spec
          .testApi('POST', '/users')
          .set('Authorization', `Bearer ${invitation}`)
          .send(body)
          .then(expectRes.invalid([
            {
              message: 'is required',
              type: 'json',
              location: '/firstName',
              validator: 'required',
              value: null,
              valueSet: true
            },
            {
              message: `must be a string between 1 and 20 characters long (the supplied string is too long: ${body.lastName.length} characters long)`,
              type: 'json',
              location: '/lastName',
              validator: 'string',
              validation: 'between',
              minLength: 1,
              maxLength: 20,
              actualLength: body.lastName.length,
              cause: 'tooLong',
              value: body.lastName,
              valueSet: true
            },
            {
              message: 'must not be blank',
              type: 'json',
              location: '/password',
              validator: 'notBlank',
              value: '   ',
              valueSet: true
            }
          ]));
      });

      const changes = [
        { property: 'active', value: false, description: 'set the status of a user' },
        { property: 'email', value: 'bar@example.com', description: 'set the e-mail of a user' },
        { property: 'role', value: 'admin', description: 'set the role of a user' }
      ];

      it('should prevent modifying admin properties', async function() {

        const invitation = await generateInvitationToken({
          email: data.reqBody.email,
          role: 'user'
        });

        changes.forEach(change => data.reqBody[change.property] = change.value);

          return spec
            .testApi('POST', '/users')
            .set('Authorization', `Bearer ${invitation}`)
            .send(data.reqBody)
            .then(expectRes.forbidden(changes.map(change => {
              return {
                message: `You are not authorized to ${change.description}. Authenticate with a user account that has more privileges.`,
                type: 'json',
                location: `/${change.property}`,
                validator: 'auth.unchanged',
                value: change.value,
                valueSet: true
              };
            })));
      });

      changes.forEach(change => {
        it(`should prevent modifying the "${change.property}" property`, async function() {

          const invitation = await generateInvitationToken({
            email: data.reqBody.email,
            role: 'user'
          });

          const body = { [change.property]: change.value };

          return spec
            .testApi('POST', '/users')
            .set('Authorization', `Bearer ${invitation}`)
            .send(body)
            .then(expectRes.forbidden({
              message: `You are not authorized to ${change.description}. Authenticate with a user account that has more privileges.`,
              type: 'json',
              location: `/${change.property}`,
              validator: 'auth.unchanged',
              value: change.value,
              valueSet: true
            }));
        });
      });
    });
  });

  /**
   * GET /users
   *
   * Tests for user listing by an admin or for checking whether an e-mail is available.
   */
  describe('GET /users', function() {
    beforeEach(function() {
      return spec.setUp(data, () => {
        data.users = [
          userFixtures.user({
            createdAt: moment().subtract(1, 'day').toDate()
          }),
          userFixtures.user({
            createdAt: moment().subtract(3, 'hours').toDate()
          }),
          userFixtures.admin({
            createdAt: moment().subtract(2, 'months').toDate()
          })
        ];

        data.user = Promise.all(data.users).then(users => users[0]);
        data.admin = Promise.all(data.users).then(users => users[2]);
      });
    });

    function getExpectedListUser(index, changes) {
      const user = data.users[index];
      return getExpectedUserAsAdmin(user, changes);
    }

    it('should allow anonymous access to check that an e-mail is free', function() {
      const email = userFixtures.email();
      return spec
        .testRetrieve(`/users?email=${email}`)
        .then(res => {
          expect(res.body).to.eql([]);
        });
    });

    it('should allow anonymous access to check that an e-mail is taken', function() {
      return spec
        .testRetrieve(`/users?email=${data.users[0].get('email')}`)
        .then(res => {
          expect(res.body).to.eql([
            { email: data.users[0].get('email') }
          ]);
        });
    });

    it('should deny anonymous access otherwise', function() {
      return spec
        .testApi('GET', '/users')
        .then(expectRes.unauthorized({
          code: 'auth.missingAuthorization',
          message: 'Authentication is required to access this resource. Authenticate by providing a Bearer token in the Authorization header.'
        }));
    });

    it('should deny access as an invited user', function() {

      const invitation = generateInvitationToken({
        email: userFixtures.email()
      });

      return spec
        .testApi('GET', '/users')
        .set('Authorization', `Bearer ${invitation}`)
        .then(expectRes.unauthorized({
          code: 'auth.invalidAuthorization',
          message: 'The Bearer token supplied in the Authorization header is invalid or has expired.'
        }));
    });

    it('should deny access with a password reset token', function() {

      const passwordResetToken = generatePasswordResetToken(data.users[0]);

      return spec
        .testApi('GET', '/users')
        .set('Authorization', `Bearer ${passwordResetToken}`)
        .then(expectRes.unauthorized({
          code: 'auth.invalidAuthorization',
          message: 'The Bearer token supplied in the Authorization header is invalid or has expired.'
        }));
    });

    describe('as a user', function() {
      it('should allow checking that an e-mail is free', function() {
        const email = userFixtures.email();
        return spec
          .testRetrieve(`/users?email=${email}`)
          .set('Authorization', `Bearer ${data.user.generateJwt()}`)
          .then(res => {
            expect(res.body).to.eql([]);
          });
      });

      it('should allow checking that an e-mail is taken', function() {
        return spec
          .testRetrieve(`/users?email=${data.users[0].get('email')}`)
          .set('Authorization', `Bearer ${data.user.generateJwt()}`)
          .then(expectUser.listInBody([
            getExpectedListUser(0, { loginCount: undefined })
          ]));
      });

      it('should deny access otherwise', function() {
        return spec
          .testApi('GET', '/users')
          .set('Authorization', `Bearer ${data.user.generateJwt()}`)
          .then(expectRes.forbidden({
            code: 'auth.forbidden',
            message: 'You are not authorized to access this resource. Authenticate with a user account that has more privileges.'
          }));
      });
    });

    describe('as an admin', function() {
      it('should retrieve users by descending creation date', function() {
        return spec
          .testRetrieve('/users')
          .set('Authorization', `Bearer ${data.admin.generateJwt()}`)
          .then(expectUser.listInBody([
            getExpectedListUser(1),
            getExpectedListUser(0),
            getExpectedListUser(2, {
              lastActiveJustAfter: data.afterSetup
            })
          ]));
      });
    });
  });

  describe('with an existing user', function() {
    beforeEach(function() {
      return spec.setUp(data, () => {

        data.threeDaysAgo = moment().subtract(3, 'days');

        const firstName = userFixtures.firstName();
        const lastName = userFixtures.lastName();
        data.password = userFixtures.password();

        data.user = userFixtures.user({
          firstName: firstName,
          lastName: lastName,
          email: userFixtures.email(firstName, lastName),
          password: data.password,
          active: true,
          role: 'user',
          createdAt: data.threeDaysAgo.toDate()
        });
      });
    });

    describe('POST /users', function() {
      describe('as an admin', function() {
        it('should not create a user with an e-mail that already exists', async function() {

          const admin = await userFixtures.admin();

          const body = {
            firstName: data.user.get('first_name'),
            lastName: data.user.get('last_name'),
            email: data.user.get('email'),
            password: userFixtures.password()
          };

          return spec
            .testApi('POST', '/users', body)
            .set('Authorization', `Bearer ${admin.generateJwt()}`)
            .then(expectRes.invalid([
              {
                message: 'is already taken',
                type: 'json',
                location: '/email',
                validator: 'user.emailAvailable',
                value: data.user.get('email'),
                valueSet: true
              }
            ]));
        });
      });

      describe('as an invited user', function() {
        it('should not create a user with an e-mail that already exists', async function() {

          const invitation = generateInvitationToken({
            firstName: data.user.get('first_name'),
            lastName: data.user.get('last_name'),
            email: data.user.get('email')
          });

          const body = {
            firstName: data.user.get('first_name'),
            lastName: data.user.get('last_name'),
            email: data.user.get('email'),
            password: userFixtures.password()
          };

          return spec
            .testApi('POST', '/users', body)
            .set('Authorization', `Bearer ${invitation}`)
            .then(expectRes.unauthorized([
              {
                code: 'auth.invalidAuthorization',
                message: 'The Bearer token supplied in the Authorization header is invalid or has expired.'
              }
            ]));
        });
      });
    });

    /**
     * GET /api/users/:id
     *
     * Tests for retrieving a user.
     */
    describe('GET /api/users/:id', function() {
      it('should deny anonymous access', function() {
        return spec
          .testApi('GET', `/users/${data.user.get('api_id')}`)
          .then(expectRes.unauthorized({
            code: 'auth.missingAuthorization',
            message: 'Authentication is required to access this resource. Authenticate by providing a Bearer token in the Authorization header.'
          }));
      });

      it('should deny access as an invited user', function() {

        const invitation = generateInvitationToken({
          email: userFixtures.email()
        });

        return spec
          .testApi('GET', `/users/${data.user.get('api_id')}`)
          .set('Authorization', `Bearer ${invitation}`)
          .then(expectRes.unauthorized({
            code: 'auth.invalidAuthorization',
            message: 'The Bearer token supplied in the Authorization header is invalid or has expired.'
          }));
      });

      it('should deny access with a password reset token', function() {

        const passwordResetToken = generatePasswordResetToken(data.user);

        return spec
          .testApi('GET', `/users/${data.user.get('api_id')}`)
          .set('Authorization', `Bearer ${passwordResetToken}`)
          .then(expectRes.unauthorized({
            code: 'auth.invalidAuthorization',
            message: 'The Bearer token supplied in the Authorization header is invalid or has expired.'
          }));
      });

      describe('as a user', function() {
        it('should retrieve the user', function() {
          return spec
            .testRetrieve(`/users/${data.user.get('api_id')}`)
            .set('Authorization', `Bearer ${data.user.generateJwt()}`)
            .then(expectUser.inBody(getExpectedUser(data.user)));
        });

        it('should not retrieve a non-existent user', function() {
          return spec
            .testApi('GET', '/users/foo')
            .set('Authorization', `Bearer ${data.user.generateJwt()}`)
            .then(expectRes.notFound({
              code: 'record.notFound',
              message: 'No user was found with ID foo.'
            }));
        });

        it('should not retrieve another user', async function() {
          const anotherUser = await userFixtures.user();
          return spec
            .testApi('GET', `/users/${data.user.get('api_id')}`)
            .set('Authorization', `Bearer ${anotherUser.generateJwt()}`)
            .then(expectRes.notFound({
              code: 'record.notFound',
              message: `No user was found with ID ${data.user.get('api_id')}.`
            }));
        });
      });

      describe('as an admin', function() {
        beforeEach(function() {
          return spec.setUp(data, () => {
            data.adminPassword = userFixtures.password();
            data.admin = userFixtures.admin({
              password: data.adminPassword
            });
          });
        });

        it('should retrieve the user', function() {
          return spec
            .testRetrieve(`/users/${data.admin.get('api_id')}`)
            .set('Authorization', `Bearer ${data.admin.generateJwt()}`)
            .then(expectUser.inBody(getExpectedUserAsAdmin(data.admin)));
        });

        it('should retrieve another user', async function() {
          const admin = await userFixtures.admin();
          return spec
            .testRetrieve(`/users/${data.user.get('api_id')}`)
            .set('Authorization', `Bearer ${admin.generateJwt()}`)
            .then(expectUser.inBody(getExpectedUserAsAdmin(data.user)));
        });

        it('should not retrieve a non-existent user', async function() {
          const admin = await userFixtures.admin();
          return spec
            .testApi('GET', '/users/foo')
            .set('Authorization', `Bearer ${admin.generateJwt()}`)
            .then(expectRes.notFound({
              code: 'record.notFound',
              message: 'No user was found with ID foo.'
            }));
        });
      });
    });

    /**
     * PATCH /api/users/:id
     *
     * Tests for updating a user, including changing the password (either as an authenticated user or with a password reset token).
     */
    describe('PATCH /api/users/:id', function() {
      it('should deny anonymous access', function() {

        const body = {
          password: userFixtures.password(),
          previousPassword: data.password
        };

        return spec
          .testApi('PATCH', `/users/${data.user.get('api_id')}`)
          .send(body)
          .then(expectRes.unauthorized({
            code: 'auth.missingAuthorization',
            message: 'Authentication is required to access this resource. Authenticate by providing a Bearer token in the Authorization header.'
          }));
      });

      it('should deny access as an invited user', function() {

        const invitation = generateInvitationToken({
          email: userFixtures.email()
        });

        const body = {
          password: userFixtures.password(),
          previousPassword: data.password
        };

        return spec
          .testApi('PATCH', `/users/${data.user.get('api_id')}`)
          .set('Authorization', `Bearer ${invitation}`)
          .send(body)
          .then(expectRes.unauthorized({
            code: 'auth.invalidAuthorization',
            message: 'The Bearer token supplied in the Authorization header is invalid or has expired.'
          }));
      });

      describe('as a user', function() {
        shouldUpdateUser(user => `/users/${user.get('api_id')}`);

        it('should not update a non-existent user', async function() {

          const body = {
            firstName: userFixtures.firstName(),
            lastName: userFixtures.lastName(),
            password: userFixtures.password(),
            previousPassword: data.password
          };

          return spec
            .testApi('PATCH', `/users/foo`)
            .set('Authorization', `Bearer ${data.user.generateJwt()}`)
            .send(body)
            .then(expectRes.notFound({
              code: 'record.notFound',
              message: 'No user was found with ID foo.'
            }));
        });

        it('should not update another user', async function() {

          const body = {
            firstName: userFixtures.firstName(),
            lastName: userFixtures.lastName(),
            password: userFixtures.password(),
            previousPassword: data.password
          };

          const anotherUser = await userFixtures.user();
          return spec
            .testApi('PATCH', `/users/${data.user.get('api_id')}`)
            .set('Authorization', `Bearer ${anotherUser.generateJwt()}`)
            .send(body)
            .then(expectRes.notFound({
              code: 'record.notFound',
              message: `No user was found with ID ${data.user.get('api_id')}.`
            }));
        });
      });

      describe('with a password reset token', function() {
        shouldResetUserPassword(user => `/users/${user.get('api_id')}`);

        it('should not update the password of a non-existent user', async function() {

          const passwordResetToken = generatePasswordResetToken(data.user);

          const body = {
            password: userFixtures.password()
          };

          return spec
            .testApi('PATCH', `/users/foo`)
            .set('Authorization', `Bearer ${passwordResetToken}`)
            .send(body)
            .then(expectRes.notFound({
              code: 'record.notFound',
              message: `No user was found with ID foo.`
            }));
        });

        it('should not update the password of another user', async function() {

          const anotherUser = await userFixtures.user();
          const passwordResetToken = generatePasswordResetToken(anotherUser);

          const body = {
            password: userFixtures.password()
          };

          const expected = getExpectedUser(data.user);

          return spec
            .testApi('PATCH', `/users/${data.user.get('api_id')}`)
            .set('Authorization', `Bearer ${passwordResetToken}`)
            .send(body)
            .then(expectRes.notFound({
              code: 'record.notFound',
              message: `No user was found with ID ${data.user.get('api_id')}.`
            }))
            .then(expectUser.inDb(expected));
        });
      });

      describe('as an admin', function() {
        it('should update all properties of the user', async function() {

          const firstName = userFixtures.firstName();
          const lastName = userFixtures.lastName();
          const body = {
            firstName: firstName,
            lastName: lastName,
            active: false,
            email: userFixtures.email(firstName, lastName),
            role: 'user',
            password: userFixtures.password()
          };

          const admin = await userFixtures.admin();
          const expected = getExpectedUserAsAdmin(admin, body, getPatches());

          return spec
            .testUpdate(`/users/${admin.get('api_id')}`)
            .set('Authorization', `Bearer ${admin.generateJwt()}`)
            .send(body)
            .then(expectUser.inBody(expected));
        });

        it('should update all properties of another user', async function() {

          const firstName = userFixtures.firstName();
          const lastName = userFixtures.lastName();
          const body = {
            firstName: firstName,
            lastName: lastName,
            active: false,
            email: userFixtures.email(firstName, lastName),
            role: 'admin',
            password: userFixtures.password()
          };

          const admin = await userFixtures.admin();
          const expected = getExpectedUserAsAdmin(data.user, body, getPatches());

          return spec
            .testUpdate(`/users/${data.user.get('api_id')}`)
            .set('Authorization', `Bearer ${admin.generateJwt()}`)
            .send(body)
            .then(expectUser.inBody(expected));
        });

        it('should not accept a new password if the previous password is sent and does not match', async function() {

          const body = {
            password: userFixtures.password(),
            previousPassword: userFixtures.password()
          };

          const admin = await userFixtures.admin();
          return spec.testApi('PATCH', `/users/${data.user.get('api_id')}`)
            .set('Authorization', `Bearer ${admin.generateJwt()}`)
            .send(body)
            .then(expectRes.invalid([
              {
                message: 'is incorrect',
                validator: 'user.previousPassword',
                type: 'json',
                location: '/previousPassword',
                value: body.previousPassword,
                valueSet: true
              }
            ]));
        });

        it('should not update a non-existent user', async function() {

          const body = {
            firstName: userFixtures.firstName(),
            lastName: userFixtures.lastName(),
            active: false,
            email: userFixtures.email(),
            role: 'admin',
            password: userFixtures.password()
          };

          const admin = await userFixtures.admin();
          return spec
            .testApi('PATCH', `/users/foo`)
            .set('Authorization', `Bearer ${admin.generateJwt()}`)
            .send(body)
            .then(expectRes.notFound({
              code: 'record.notFound',
              message: 'No user was found with ID foo.'
            }));
        });
      });
    });

    /**
     * GET /api/me
     *
     * Tests for retrieving the authenticated user.
     */
    describe('GET /api/me', function() {
      it('should deny anonymous access', function() {
        return spec
          .testApi('GET', '/me')
          .then(expectRes.unauthorized({
            code: 'auth.missingAuthorization',
            message: 'Authentication is required to access this resource. Authenticate by providing a Bearer token in the Authorization header.'
          }));
      });

      it('should deny access as an invited user', function() {

        const invitation = generateInvitationToken({
          email: userFixtures.email()
        });

        return spec
          .testApi('GET', '/me')
          .set('Authorization', `Bearer ${invitation}`)
          .then(expectRes.unauthorized({
            code: 'auth.invalidAuthorization',
            message: 'The Bearer token supplied in the Authorization header is invalid or has expired.'
          }));
      });

      it('should deny access with a password reset token', function() {

        const passwordResetToken = generatePasswordResetToken(data.user);

        return spec
          .testApi('GET', '/me')
          .set('Authorization', `Bearer ${passwordResetToken}`)
          .then(expectRes.unauthorized({
            code: 'auth.invalidAuthorization',
            message: 'The Bearer token supplied in the Authorization header is invalid or has expired.'
          }));
      });

      describe('as a user', function() {
        it('should retrieve the user', function() {
          return spec
            .testRetrieve('/me')
            .set('Authorization', `Bearer ${data.user.generateJwt()}`)
            .then(expectUser.inBody(getExpectedUser(data.user)));
        });
      });

      describe('as an admin', function() {
        beforeEach(function() {
          return spec.setUp(data, async () => {
            await data.user.save({ role: 'admin' });
          });
        });

        it('should retrieve the user', function() {
          return spec
            .testRetrieve('/me')
            .set('Authorization', `Bearer ${data.user.generateJwt()}`)
            .then(expectUser.inBody(getExpectedUserAsAdmin(data.user)));
        });
      });
    });

    /**
     * PATCH /api/me
     *
     * Tests for updating the authenticated user (e.g. profile management).
     */
    describe('PATCH /api/me', function() {
      it('should deny anonymous access', function() {

        const body = {
          firstName: userFixtures.firstName(),
          lastName: userFixtures.lastName(),
          password: userFixtures.password(),
          previousPassword: data.password
        };

        return spec
          .testApi('PATCH', '/me')
          .then(expectRes.unauthorized({
            code: 'auth.missingAuthorization',
            message: 'Authentication is required to access this resource. Authenticate by providing a Bearer token in the Authorization header.'
          }));
      });

      it('should deny access as an invited user', function() {

        const invitation = generateInvitationToken({
          email: userFixtures.email()
        });

        const body = {
          firstName: userFixtures.firstName(),
          lastName: userFixtures.lastName(),
          password: userFixtures.password(),
          previousPassword: data.password
        };

        return spec
          .testApi('PATCH', '/me')
          .set('Authorization', `Bearer ${invitation}`)
          .then(expectRes.unauthorized({
            code: 'auth.invalidAuthorization',
            message: 'The Bearer token supplied in the Authorization header is invalid or has expired.'
          }));
      });

      describe('as a user', function() {
        shouldUpdateUser(() => '/me');
      });

      describe('with a password reset token', function() {
        shouldResetUserPassword(() => '/me');
      });

      describe('as an admin', function() {
        beforeEach(async function() {
          await data.user.save({ role: 'admin' });
        });

        it('should update all properties of the user', async function() {

          const firstName = userFixtures.firstName();
          const lastName = userFixtures.lastName();
          const body = {
            firstName: firstName,
            lastName: lastName,
            active: false,
            email: userFixtures.email(firstName, lastName),
            role: 'user',
            password: userFixtures.password()
          };

          const expected = getExpectedUserAsAdmin(data.user, body, getPatches());

          return spec
            .testUpdate('/me')
            .set('Authorization', `Bearer ${data.user.generateJwt()}`)
            .send(body)
            .then(expectUser.inBody(expected));
        });

        it('should not accept a new password if the previous password is sent and does not match', async function() {

          const body = {
            password: userFixtures.password(),
            previousPassword: userFixtures.password()
          };

          return spec.testApi('PATCH', '/me')
            .set('Authorization', `Bearer ${data.user.generateJwt()}`)
            .send(body)
            .then(expectRes.invalid([
              {
                message: 'is incorrect',
                validator: 'user.previousPassword',
                type: 'json',
                location: '/previousPassword',
                value: body.previousPassword,
                valueSet: true
              }
            ]));
        });
      });
    });
  });

  // Shared tests for PATCH /api/users/:id & PATCH /api/me
  function shouldUpdateUser(urlFunc) {
    it('should update the user', function() {

      const body = {
        firstName: userFixtures.firstName(),
        lastName: userFixtures.lastName(),
        password: userFixtures.password(),
        previousPassword: data.password
      };

      const expected = getExpectedUser(data.user, body, getPatches());

      return spec
        .testUpdate(urlFunc(data.user))
        .set('Authorization', `Bearer ${data.user.generateJwt()}`)
        .send(body)
        .then(expectUser.inBody(expected));
    });

    it('should not accept invalid properties', function() {

      const body = {
        firstName: 42,
        lastName: '  \t \n ',
        password: '',
        previousPassword: 'foo'
      };

      return spec.testApi('PATCH', urlFunc(data.user))
        .set('Authorization', `Bearer ${data.user.generateJwt()}`)
        .send(body)
        .then(expectRes.invalid([
          {
            validator: 'type',
            type: 'json',
            location: '/firstName',
            message: 'must be of type string',
            types: [ 'string' ],
            value: 42,
            valueSet: true
          },
          {
            validator: 'notBlank',
            type: 'json',
            location: '/lastName',
            message: 'must not be blank',
            value: '  \t \n ',
            valueSet: true
          },
          {
            validator: 'notBlank',
            type: 'json',
            location: '/password',
            message: 'must not be blank',
            value: '',
            valueSet: true
          },
          {
            validator: 'user.previousPassword',
            type: 'json',
            location: '/previousPassword',
            message: 'is incorrect',
            value: 'foo',
            valueSet: true
          }
        ]));
    });

    it('should not accept a new password without the previous password', function() {

      const body = {
        password: userFixtures.password()
      };

      return spec.testApi('PATCH', urlFunc(data.user))
        .set('Authorization', `Bearer ${data.user.generateJwt()}`)
        .send(body)
        .then(expectRes.invalid([
          {
            message: 'is required',
            validator: 'required',
            type: 'json',
            location: '/previousPassword',
            valueSet: false
          }
        ]));
    });

    it('should not accept a new password if the previous password does not match', function() {

      const body = {
        password: userFixtures.password(),
        previousPassword: userFixtures.password()
      };

      return spec.testApi('PATCH', urlFunc(data.user))
        .set('Authorization', `Bearer ${data.user.generateJwt()}`)
        .send(body)
        .then(expectRes.invalid([
          {
            message: 'is incorrect',
            validator: 'user.previousPassword',
            type: 'json',
            location: '/previousPassword',
            value: body.previousPassword,
            valueSet: true
          }
        ]));
    });

    const changes = [
      { property: 'active', value: false, description: 'set the status of a user' },
      { property: 'email', value: 'bar@example.com', description: 'set the e-mail of a user' },
      { property: 'role', value: 'admin', description: 'set the role of a user' }
    ];

    it('should prevent modifying admin properties', function() {

      const body = _.reduce(changes, (memo, change) => {
        memo[change.property] = change.value;
        return memo;
      }, {});

      return spec
        .testApi('PATCH', urlFunc(data.user))
        .set('Authorization', `Bearer ${data.user.generateJwt()}`)
        .send(body)
        .then(expectRes.forbidden(changes.map(change => {
          return {
            message: `You are not authorized to ${change.description}. Authenticate with a user account that has more privileges.`,
            type: 'json',
            location: `/${change.property}`,
            validator: 'auth.unchanged',
            value: change.value,
            valueSet: true
          };
        })));
    });

    changes.forEach(change => {
      it(`should prevent modifying the "${change.property}" property`, function() {

        const body = { [change.property]: change.value };

        return spec
          .testApi('PATCH', urlFunc(data.user))
          .set('Authorization', `Bearer ${data.user.generateJwt()}`)
          .send(body)
          .then(expectRes.forbidden({
            message: `You are not authorized to ${change.description}. Authenticate with a user account that has more privileges.`,
            type: 'json',
            location: `/${change.property}`,
            validator: 'auth.unchanged',
            value: change.value,
            valueSet: true
          }));
      });
    });
  }

  // Shared tests for PATCH /api/users/:id & PATCH /users/me with a password reset token
  function shouldResetUserPassword(urlFunc) {
    it('should update the password', function() {

      const passwordResetToken = generatePasswordResetToken(data.user);

      const body = {
        password: userFixtures.password()
      };

      const expected = getExpectedUser(data.user, body, getPatches(), {
        passwordResetCount: data.user.get('password_reset_count') + 1
      });

      return spec
        .testUpdate(urlFunc(data.user))
        .set('Authorization', `Bearer ${passwordResetToken}`)
        .send(body)
        .then(expectUser.inBody(expected));
    });

    it('should not update the password if the password reset count does not match', async function() {

      const passwordResetToken = generatePasswordResetToken(data.user);
      await data.user.save({ password_reset_count: 1 });

      const body = {
        password: userFixtures.password()
      };

      const expected = getExpectedUser(data.user, {
        password: data.password,
        passwordResetCount: 1
      });

      return spec
        .testApi('PATCH', urlFunc(data.user))
        .set('Authorization', `Bearer ${passwordResetToken}`)
        .send(body)
        .then(expectRes.unauthorized({
          code: 'auth.invalidAuthorization',
          message: 'The Bearer token supplied in the Authorization header is invalid or has expired.'
        }))
        .then(expectUser.inDb(expected));
    });

    it('should not update the password twice', async function() {

      const passwordResetToken = generatePasswordResetToken(data.user);

      const body = {
        password: userFixtures.password()
      };

      const expected = getExpectedUser(data.user, body, getPatches(), {
        passwordResetCount: data.user.get('password_reset_count') + 1
      });

      await spec
        .testUpdate(urlFunc(data.user))
        .set('Authorization', `Bearer ${passwordResetToken}`)
        .send(body)
        .then(expectUser.inBody(expected))
        .then(res => {
          expected.updatedJustAfter = null;
          expected.updatedAt = res.body.updatedAt;
        });

      body.password = userFixtures.password();

      return spec
        .testApi('PATCH', urlFunc(data.user))
        .set('Authorization', `Bearer ${passwordResetToken}`)
        .send(body)
        .then(expectRes.unauthorized({
          code: 'auth.invalidAuthorization',
          message: 'The Bearer token supplied in the Authorization header is invalid or has expired.'
        }))
        .then(expectUser.inDb(expected));
    });

    const changes = [
      { property: 'active', value: false, description: 'set the status of a user' },
      { property: 'email', value: userFixtures.email(), description: 'set the e-mail of a user' },
      { property: 'role', value: 'admin', description: 'set the role of a user' },
      { property: 'firstName', value: userFixtures.firstName(), description: 'set the first name of a user' },
      { property: 'lastName', value: userFixtures.lastName(), description: 'set the last name of a user' }
    ];

    it('should prevent modifying other attributes than the password', function() {

      const passwordResetToken = generatePasswordResetToken(data.user);

      const body = _.reduce(changes, (memo, change) => {
        memo[change.property] = change.value;
        return memo;
      }, {
        password: userFixtures.password()
      });

      const expected = getExpectedUser(data.user);

      return spec
        .testApi('PATCH', urlFunc(data.user))
        .set('Authorization', `Bearer ${passwordResetToken}`)
        .send(body)
        .then(expectRes.forbidden(changes.map(change => {
          return {
            message: `You are not authorized to ${change.description}. Authenticate with a user account that has more privileges.`,
            type: 'json',
            location: `/${change.property}`,
            validator: 'auth.unchanged',
            value: change.value,
            valueSet: true
          };
        })))
        .then(expectUser.inDb(expected));
    });

    changes.forEach(change => {
      it(`should prevent modifying the "${change.property}" property`, function() {

        const passwordResetToken = generatePasswordResetToken(data.user);

        const body = {
          password: userFixtures.password(),
          [change.property]: change.value
        };

        const expected = getExpectedUser(data.user);

        return spec
          .testApi('PATCH', urlFunc(data.user))
          .set('Authorization', `Bearer ${passwordResetToken}`)
          .send(body)
          .then(expectRes.forbidden({
            message: `You are not authorized to ${change.description}. Authenticate with a user account that has more privileges.`,
            type: 'json',
            location: `/${change.property}`,
            validator: 'auth.unchanged',
            value: change.value,
            valueSet: true
          }))
          .then(expectUser.inDb(expected));
      });
    });
  }

  function generateInvitationToken(...changes) {

    const claims = _.extend({
      authType: 'invitation',
      email: _.get(data, 'reqBody.email'),
      role: 'user'
    }, ...changes);

    if (!claims.email) {
      throw new Error('"email" claim is required');
    }

    return jwt.generateToken(claims);
  }

  function generatePasswordResetToken(user, ...changes) {
    const now = new Date();
    return jwt.generateToken(_.extend({
      email: user.get('email'),
      authType: 'passwordReset',
      passwordResetCount: user.get('password_reset_count'),
      sub: user.get('api_id'),
      iat: moment(now).unix(),
      exp: moment(now).add(1, 'hour').unix()
    }, ...changes));
  }

  function getPatches(...changes) {
    return _.extend({
      updatedAt: null,
      updatedJustAfter: data.afterSetup
    }, ...changes);
  }


  function getExpectedUser(user, ...changes) {
    return _.extend({
      id: user.get('api_id'),
      firstName: user.get('first_name'),
      lastName: user.get('last_name'),
      email: user.get('email'),
      active: user.get('active'),
      role: user.get('role'),
      createdAt: user.get('created_at'),
      updatedAt: user.get('updated_at')
    }, ...changes);
  }

  function getExpectedUserAsAdmin(user, ...changes) {
    return getExpectedUser(user, {
      loginCount: user.get('login_count'),
      lastActiveAt: user.get('last_active_at'),
      lastLoginAt: user.get('last_login_at')
    }, ...changes);
  }
});
