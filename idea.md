I want to build an AI email agent for gmail

use gmail API to fatch everthing from  primary inbox

The agent should craft the reply using OpenAi or Gemini API

There sould be a supabase database where the knowledge is stored

Basically we have couses or programs regarding whihc we will receive emails

so when the reply is crafted it should refer to the documents mentioning the program info

I need the ability to modify the email drafted by AI before sending (if needed)

In the supabase the originla emial drafted by AI and the one I send should be stored

The frontend should e deployed on vercel.if backend funcitonality is needed it should be deployed of railway

 You should never send the emil automatically
 the user sould approve with one button click

 Implemtn authentication so the only ower of the email has access 

 the login can be via google login

 for every emial reply, there should be s star rating and textual feedback option taht stored on supabase 

 The existing knowledge base in the csv file in the working directory should converted to a vector database and stored in supabase YOU will have to perform RAG to fetch the relivent info from the vectore database

 The implementation should happen in phases .So you plan first ,ask my perferences and then execute in phases 