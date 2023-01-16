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
    console.log("err.message");
}
const db = mongoClient.db() 

server.post("/participants", async (req, res) => {
    const nome = req.body;
    const validaSchema = joi.object({name: joi.string().required()});
    const validation = validaSchema.validate(nome);
    console.log(nome)
    if (validation.error) return res.status(422).send("Favor informar o nome");
    try {
        const busca = await db.collection("participants").findOne({ name: nome });
        if (!busca) {
            const horario = dayjs().format('hh:mm:ss');
            await db.collection("participants").insertOne({ name: nome.name, lastStatus: Date.now() });
            await db.collection("messages").insertOne({from: nome.name, to: 'Todos', text: 'entra na sala...', type: 'status', time: horario})
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
    const {user}= req.headers;

    const conteudoSchema = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().pattern(/^[message, private_message]+$/).required()
    })
    const validation = conteudoSchema.validate(conteudo);
    if(validation.error) return res.status(422).send(validation.error.details);
    if(!user) return res.status(422).send("Você precisa ser um usuário para enviar mensagens")
    try {
        const horario = dayjs().format('hh:mm:ss');
        const buscaUsuario = await db.collection("participants").findOne({name: user})
        console.log({from: user, to: conteudo.to, text: conteudo.text, type: conteudo.type, time: horario})
        if(buscaUsuario){
           await db.collection("messages").insertOne({from: user, to: conteudo.to, text: conteudo.text, type: conteudo.type, time: horario})
            return res.sendStatus(201);
        }
        res.status(400).send("usuario nao cadastrado")
        
    } catch (error) {
        res.status(500).send(error.message)      
    }
});

server.get("/messages", async (req,res) => {
    const filtro = req.query.limit;
    const listaMensagens = await db.collection("messages").find().toArray();

    if(!filtro){
        return res.send(listaMensagens);
    }
    //dar um reverse, depois um slice
    res.send(listaMensagens.slice(filtro));
})


