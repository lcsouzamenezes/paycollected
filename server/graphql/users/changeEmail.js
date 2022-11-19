import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import sgMail from '@sendgrid/mail';
import { GraphQLError } from 'graphql';
import { getUserInfo, changeEmail as changeEmailModel } from '../../db/models';
import { generateConfigEmailVerification } from '../../utils';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export default async function changeEmail(username, password, newEmail) {
  let email;
  let savedPwd;
  let firstName;
  let lastName;
  try {
    ({
      rows: [{
        email, password: savedPwd, firstName, lastName
      }]
    } = await getUserInfo(username));
  } catch (e) {
    console.log(e);
    throw new GraphQLError('Unable to change email', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
  }

  if (email === newEmail) {
    throw new GraphQLError('No change in email', { extensions: { code: 'BAD_USER_INPUT' } });
  }

  let result;
  try {
    result = await bcrypt.compare(password, savedPwd);
  } catch (e) {
    console.log(e);
    throw new GraphQLError('Unable to change email', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
  }

  if (!result) {
    throw new GraphQLError('Incorrect password', { extensions: { code: 'BAD_USER_INPUT' } });
  }
  const name = `${firstName} ${lastName}`;
  const token = jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000) + (60 * 15), email, name, username
    },
    process.env.EMAIL_VERIFY_SECRET_KEY
  );

  try {
    await Promise.all([
      changeEmailModel(username, newEmail),
      sgMail.send(generateConfigEmailVerification(name, firstName, newEmail, token, 'returning'))
    ]);
    return true;
  } catch (e) {
    console.log(e);
    throw new GraphQLError('Unable to change email', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
  }
}
