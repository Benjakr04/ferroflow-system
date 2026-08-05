import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import {env} from "../../config/env";


export async function hashPassword(password: string): Promise<string> {  //hashea la contraseña del usuario para guardarla en la base de datos
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  return hashedPassword;
}

export async function comparePasswords(password: string, hashedPassword: string): Promise<boolean> { //compara la contraseña ingresada por el usuario con la contraseña hasheada almacenada en la base de datos
    return await bcrypt.compare(password, hashedPassword);
}

export function generateToken(payload: object, expiresIn: string = "7d"): string {
  const options = { expiresIn } as SignOptions;
  return jwt.sign(payload, env.JWT_SECRET as string, options);
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, env.JWT_SECRET as string);
  } catch (error) {
    return null;
  }
}