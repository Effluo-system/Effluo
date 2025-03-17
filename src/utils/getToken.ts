export const getToken = (req: any) => {
  return req.headers.authorization;
};
