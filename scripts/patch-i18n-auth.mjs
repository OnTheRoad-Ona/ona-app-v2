import fs from "fs";
import path from "path";

const dir = "src/lib/i18n/catalog";
const files = ["fr", "es", "pt", "ar", "sw", "zh", "ha", "ig", "yo", "pcm"];

const inserts = {
  fr: {
    "auth.welcomeTo": "Bienvenue sur",
    "auth.welcomeTagline": "Demandez de l'aide et proposez des services routiers",
    "auth.loginAs": "Se connecter en tant que",
    "auth.emailTab": "E-mail",
    "auth.phoneTab": "Code téléphone",
    "auth.pleaseWait": "Veuillez patienter…",
    "auth.sendSmsCode": "Envoyer le code SMS",
    "auth.verifyAndLogin": "Vérifier et se connecter",
    "auth.resendCode": "Renvoyer le code",
    "auth.resetPassword": "Réinitialiser le mot de passe",
    "auth.sendResetLink": "Envoyer le lien",
    "auth.sending": "Envoi…",
  },
  es: {
    "auth.welcomeTo": "Bienvenido a",
    "auth.welcomeTagline": "Pide ayuda y ofrece servicios en carretera",
    "auth.loginAs": "Iniciar sesión como",
    "auth.emailTab": "Correo",
    "auth.phoneTab": "Código SMS",
    "auth.pleaseWait": "Espere…",
    "auth.sendSmsCode": "Enviar código SMS",
    "auth.verifyAndLogin": "Verificar e iniciar sesión",
    "auth.resendCode": "Reenviar código",
    "auth.resetPassword": "Restablecer contraseña",
    "auth.sendResetLink": "Enviar enlace",
    "auth.sending": "Enviando…",
  },
  pt: {
    "auth.welcomeTo": "Bem-vindo ao",
    "auth.welcomeTagline": "Peça ajuda e ofereça serviços na estrada",
    "auth.loginAs": "Entrar como",
    "auth.emailTab": "E-mail",
    "auth.phoneTab": "Código SMS",
    "auth.pleaseWait": "Aguarde…",
    "auth.sendSmsCode": "Enviar código SMS",
    "auth.verifyAndLogin": "Verificar e entrar",
    "auth.resendCode": "Reenviar código",
    "auth.resetPassword": "Redefinir senha",
    "auth.sendResetLink": "Enviar link",
    "auth.sending": "Enviando…",
  },
  ar: {
    "auth.welcomeTo": "مرحباً بك في",
    "auth.welcomeTagline": "اطلب المساعدة وقدم خدمات الطريق",
    "auth.loginAs": "تسجيل الدخول كـ",
    "auth.emailTab": "البريد",
    "auth.phoneTab": "رمز الهاتف",
    "auth.pleaseWait": "يرجى الانتظار…",
    "auth.sendSmsCode": "إرسال رمز SMS",
    "auth.verifyAndLogin": "تحقق وسجّل الدخول",
    "auth.resendCode": "إعادة إرسال الرمز",
    "auth.resetPassword": "إعادة تعيين كلمة المرور",
    "auth.sendResetLink": "إرسال الرابط",
    "auth.sending": "جارٍ الإرسال…",
  },
  sw: {
    "auth.welcomeTo": "Karibu kwenye",
    "auth.welcomeTagline": "Omba msaada na toa huduma za barabarani",
    "auth.loginAs": "Ingia kama",
    "auth.emailTab": "Barua pepe",
    "auth.phoneTab": "Msimbo wa simu",
    "auth.pleaseWait": "Tafadhali subiri…",
    "auth.sendSmsCode": "Tuma msimbo wa SMS",
    "auth.verifyAndLogin": "Thibitisha na uingie",
    "auth.resendCode": "Tuma tena msimbo",
    "auth.resetPassword": "Weka upya nenosiri",
    "auth.sendResetLink": "Tuma kiungo",
    "auth.sending": "Inatuma…",
  },
  zh: {
    "auth.welcomeTo": "欢迎使用",
    "auth.welcomeTagline": "请求路边帮助，提供路边服务",
    "auth.loginAs": "登录身份",
    "auth.emailTab": "邮箱",
    "auth.phoneTab": "手机验证码",
    "auth.pleaseWait": "请稍候…",
    "auth.sendSmsCode": "发送短信验证码",
    "auth.verifyAndLogin": "验证并登录",
    "auth.resendCode": "重新发送",
    "auth.resetPassword": "重置密码",
    "auth.sendResetLink": "发送重置链接",
    "auth.sending": "发送中…",
  },
  ha: {
    "auth.welcomeTo": "Barka da zuwa",
    "auth.welcomeTagline": "Nemi taimako kuma bayar da sabis a hanya",
    "auth.loginAs": "Shiga a matsayin",
    "auth.emailTab": "Imel",
    "auth.phoneTab": "Lambar waya",
    "auth.pleaseWait": "Da fatan za a jira…",
    "auth.sendSmsCode": "Aika lambar SMS",
    "auth.verifyAndLogin": "Tabbatar ka shiga",
    "auth.resendCode": "Sake aikawa",
    "auth.resetPassword": "Sake saita kalmar sirri",
    "auth.sendResetLink": "Aika hanyar haɗi",
    "auth.sending": "Ana aikawa…",
  },
  ig: {
    "auth.welcomeTo": "Nnọọ na",
    "auth.welcomeTagline": "Rịọ enyemaka ma nye ọrụ n'okporo ụzọ",
    "auth.loginAs": "Banye dị ka",
    "auth.emailTab": "Email",
    "auth.phoneTab": "Koodu ekwentị",
    "auth.pleaseWait": "Biko chere…",
    "auth.sendSmsCode": "Zipu koodu SMS",
    "auth.verifyAndLogin": "Nyochaa ma banye",
    "auth.resendCode": "Zipugharia koodu",
    "auth.resetPassword": "Tọgharịa paswọọdụ",
    "auth.sendResetLink": "Zipu njikọ",
    "auth.sending": "Na-ezipu…",
  },
  yo: {
    "auth.welcomeTo": "Káàbọ̀ sí",
    "auth.welcomeTagline": "Béèrè ìrànlọ́wọ́ kí o sì pèsè iṣẹ́ ojú ọ̀nà",
    "auth.loginAs": "Wọlé gẹ́gẹ́ bí",
    "auth.emailTab": "Ímeèlì",
    "auth.phoneTab": "Kóòdù fóònù",
    "auth.pleaseWait": "Jọ̀wọ́ dúró…",
    "auth.sendSmsCode": "Fi kóòdù SMS ránṣẹ́",
    "auth.verifyAndLogin": "Ṣàyẹ̀wò kí o wọlé",
    "auth.resendCode": "Tún fi kóòdù ránṣẹ́",
    "auth.resetPassword": "Tún ṣètò ọ̀rọ̀ ìgbaniwọlé",
    "auth.sendResetLink": "Fi ọ̀nà àsopọ̀ ránṣẹ́",
    "auth.sending": "Ń fi ránṣẹ́…",
    "menu.switchRole": "Yí ipa padà",
    "menu.addMotorist": "Ṣe àkántì Motorist",
    "menu.addPro": "Ṣe àkántì Repair Pro",
  },
  pcm: {
    "auth.welcomeTo": "Welcome to",
    "auth.welcomeTagline": "Request help and offer roadside services",
    "auth.loginAs": "Log in as",
    "auth.emailTab": "Email",
    "auth.phoneTab": "Phone code",
    "auth.pleaseWait": "Abeg wait…",
    "auth.sendSmsCode": "Send SMS code",
    "auth.verifyAndLogin": "Verify code & log in",
    "auth.resendCode": "Send code again",
    "auth.resetPassword": "Reset password",
    "auth.sendResetLink": "Send reset link",
    "auth.sending": "E dey send…",
  },
};

for (const code of files) {
  const fp = path.join(dir, `${code}.ts`);
  let src = fs.readFileSync(fp, "utf8");
  const pack = inserts[code] || inserts.pcm;

  if (!src.includes('"auth.welcomeTo"')) {
    const welcomeMatch = src.match(/(\s*"auth\.welcome":\s*"[^"]*",\n)/);
    if (!welcomeMatch) {
      console.error("no auth.welcome in", code);
      continue;
    }
    const welcomeBlock =
      `  "auth.welcomeTo": ${JSON.stringify(pack["auth.welcomeTo"])},\n` +
      `  "auth.welcomeTagline": ${JSON.stringify(pack["auth.welcomeTagline"])},\n`;
    src = src.replace(welcomeMatch[1], welcomeMatch[1] + welcomeBlock);
  }

  const restKeys = [
    "auth.loginAs",
    "auth.emailTab",
    "auth.phoneTab",
    "auth.pleaseWait",
    "auth.sendSmsCode",
    "auth.verifyAndLogin",
    "auth.resendCode",
    "auth.resetPassword",
    "auth.sendResetLink",
    "auth.sending",
  ];
  if (!src.includes('"auth.loginAs"')) {
    const restBlock =
      restKeys
        .map((k) => `  "${k}": ${JSON.stringify(pack[k])},`)
        .join("\n") + "\n";
    if (src.includes('"auth.about1min"')) {
      src = src.replace(
        /(\s*"auth\.about1min":\s*"[^"]*",\n)/,
        (mm) => mm + restBlock
      );
    } else {
      src = src.replace(/(\s*"settings\.title":)/, restBlock + "$1");
    }
  }

  if (code === "yo") {
    if (pack["menu.switchRole"]) {
      src = src.replace(
        /"menu\.switchRole":\s*"[^"]*"/,
        `"menu.switchRole": ${JSON.stringify(pack["menu.switchRole"])}`
      );
    }
    if (pack["menu.addMotorist"]) {
      src = src.replace(
        /"menu\.addMotorist":\s*"[^"]*"/,
        `"menu.addMotorist": ${JSON.stringify(pack["menu.addMotorist"])}`
      );
    }
    if (pack["menu.addPro"]) {
      src = src.replace(
        /"menu\.addPro":\s*"[^"]*"/,
        `"menu.addPro": ${JSON.stringify(pack["menu.addPro"])}`
      );
    }
  }

  fs.writeFileSync(fp, src);
  console.log("updated", code);
}
