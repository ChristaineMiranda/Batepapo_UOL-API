import express from 'express'
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'
import joi from 'joi'
import dayjs from 'dayjs'
dotenv.config();

const PORT = 5000;
const server = express();
server.use(cors());
server.use(express.json());
server.listen(PORT, () => {
    console.log("Servidor no ar!");
});

const mongoClient = new MongoClient(process.env.DATABASE_URL);

try {
    await mongoClient.connect(); //aguarda resultado da tentativa de conexão. Se conseguir segue, se não cai no catch
    console.log("Conectado ao MongoDB");
} catch (err) {
    console.log(err.message);
}
const db = mongoClient.db()

server.post("/participants", async (req, res) => {
    const nome = req.body;
    const validaSchema = joi.object({ name: joi.string().required() });
    const validation = validaSchema.validate(nome);

    if (validation.error) return res.status(422).send("Favor informar o nome");
    try {
        const busca = await db.collection("participants").findOne({ name: nome.name });
        if (!busca) {
            const horario = dayjs().format('hh:mm:ss');
            await db.collection("participants").insertOne({ name: nome.name, lastStatus: Date.now() });
            await db.collection("messages").insertOne({ from: nome.name, to: 'Todos', text: 'entra na sala...', type: 'status', time: horario })
            return res.sendStatus(201);
        }
        res.status(409).send("Já existe um cadastro nesse nome");

    } catch (err) {
        res.status(500).send("Erro no servidor");
    }
})

server.get("/participants", async (req, res) => {
    try {
        const listaParticipantes = await db.collection("participants").find().toArray();
        res.status(200).send(listaParticipantes);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

server.post("/messages", async (req, res) => {
    const conteudo = req.body;
    const { user } = req.headers;

    const conteudoSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().valid("message", "private_message").required()
    })
    const validation = conteudoSchema.validate(conteudo);
    if (validation.error) return res.status(422).send(validation.error.details);
    if (!user) return res.status(422).send("Você precisa ser um usuário para enviar mensagens")
    try {
        const horario = dayjs().format('hh:mm:ss');
        const buscaUsuario = await db.collection("participants").findOne({ name: user })
        if (buscaUsuario) {
            await db.collection("messages").insertOne({ from: user, to: conteudo.to, text: conteudo.text, type: conteudo.type, time: horario })
            return res.sendStatus(201);
        }
        res.status(422).send("usuario nao cadastrado")

    } catch (error) {
        res.status(500).send(error.message)
    }
});

server.get("/messages", async (req, res) => {
    const filtro = req.query.limit;
    const { user } = req.headers;


    function filtragemParaExibicao(item) {
        if (item.to === user || item.from === user || item.type == "message") return true;
        else return false;
    }
    function formataMensagem(item) {
        return {
            to: item.to,
            text: item.text,
            type: item.type,
            from: item.from,
            time: item.time
        }
    }


    try {
        const listaMensagens = await db.collection("messages").find().toArray();
        let filtrados = listaMensagens.filter(filtragemParaExibicao);
        let filtradosFormatados = filtrados.map(formataMensagem);

        if (!filtro) {
            return res.send(filtradosFormatados);
        }
        if (isNaN(filtro) || filtro <= 0) return res.status(422).send("Filtro inválido");
        
        let filtradosQuantidade = filtradosFormatados.slice(-filtro);   
        res.send(filtradosQuantidade);

    } catch (error) {
        res.status(500).send(error.message);
    }
});

server.post("/status", async (req, res) => {
    const { user } = req.headers;
    try {
        const busca = await db.collection("participants").findOne({ name: user });
        if (!busca) return res.status(404).send("Usuário não encontrado");
        await db.collection("participants").updateOne({ name: user }, { $set: { lastStatus: Date.now() } })
        res.send("status atualizado")
    } catch (error) {
        res.status(500).send(error.message)
    }
})


async function removeInativos() {
    let tolerancia = Date.now - 10000;
    let usuariosARemover = await db.collection("participants").find({ lastStatus: { $lt: tolerancia } }).toArray();

    const novo = usuariosARemover.map(async (item) => {
        await db.collection("messages").insertOne({ from: item.name, to: 'Todos', text: 'sai da sala...', type: 'status', time: Date.now() });
        await db.collection("participants").deleteOne({ name: item.name });
        return true
    })



}

setInterval(removeInativos, 15000);



