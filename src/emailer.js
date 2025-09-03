import Fastify from "fastify";
import { ConfidentialClientApplication } from "@azure/msal-node";
import axios from "axios";
import "dotenv/config";
import fs from "fs";
import path from "path";
import handlebars from "handlebars";

const fastify = Fastify({ logger: true });

const {
	CLIENT_ID,
	CLIENT_SECRET,
	TENANT_ID,
	MAIL_USERNAME,
} = process.env;

const authority = `https://login.microsoftonline.com/${TENANT_ID}`;
const scope = ["https://graph.microsoft.com/.default"];

// Configuração MSAL
const msalConfig = {
	auth: {
		clientId: CLIENT_ID,
		authority,
		clientSecret: CLIENT_SECRET,
	},
};
const cca = new ConfidentialClientApplication(msalConfig);

// Obtém token OAuth2
async function getAccessToken() {
	const result = await cca.acquireTokenByClientCredential({
		scopes: scope,
	});
	return result.accessToken;
}

function renderTemplate(templateName, data) {
	const filePath = "src/handlebars/" + templateName + ".hbs";
	const source = fs.readFileSync(filePath, "utf8");
	const template = handlebars.compile(source);
	return template(data);
}


// Envia e-mail via Microsoft Graph
async function sendEmail(subject, body, recipients) {
	const token = await getAccessToken();

	const url = `https://graph.microsoft.com/v1.0/users/${MAIL_USERNAME}/sendMail`;

	const data = {
		message: {
			subject,
			body: {
				contentType: "HTML",
				content: body,
			},
			from: {
				emailAddress: {
					address: MAIL_USERNAME,
				},
			},
			toRecipients: recipients.split(",").map((r) => ({
				emailAddress: { address: r.trim() },
			})),
		},
	};

	const response = await axios.post(url, data, {
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
	});

	if (response.status === 202) {
		return { success: true, message: "E-mail enviado com sucesso!" };
	} else {
		throw new Error(
			`Erro ao enviar e-mail: ${response.status} - ${JSON.stringify(
				response.data
			)}`
		);
	}
}

// Rota Fastify para envio de e-mail
fastify.post("/send-email", async (request, reply) => {
	const { subject, resetLink, to } = request.body;

	const htmlBody = renderTemplate("password-reset", {
		nome: "Icaro",
		resetLink,
		ano: new Date().getFullYear(),
	});

	try {
		console.time()
		const result = await sendEmail(subject, htmlBody, to);
		console.timeEnd()
		return result;
	} catch (err) {
		request.log.error(err);
		return reply.code(500).send({ success: false, error: err.message });
	}
});

// Inicia o servidor
const start = async () => {
	try {

		await fastify.listen({ port: 3000, host: "0.0.0.0" });
		fastify.log.info("🚀 Servidor rodando em http://localhost:3000");
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
};

start();
