

Nebius
Healthcare / Life Sciences: Research Paper Discovery
by Nebius
1,000 $ Cloud Credits
2,000 $ Token Factory Credits
−
<br />
The problem
Researchers often have a collection of papers relevant to their topic but struggle to find more through keyword searches alone. Build an app that takes this existing collection as a starting point and discovers additional relevant publications.

The challenge
Your app should help a researcher move from known papers to a ranked, traceable set of new ones. It should make clear why each recommendation is relevant and where the supporting information came from.

Possible approaches
Choose your own approach, or combine several:

Follow citation and reference networks to find papers connected to several seed publications.
Use embeddings to retrieve semantically similar papers from titles, abstracts, or other metadata.
Use LLMs to assess relevance, rank candidates, expand a research question, and explain recommendations.
Use agentic search to find web context, sources, and useful enrichment beyond a single publication database.
Combine retrieval, ranking, and human review into an interactive exploration workflow.
Services to use
Use Nebius Token Factory for embeddings and LLM inference. It can support semantic retrieval, relevance assessment, ranking, and clear explanations of results.

Use Tavily for agentic search. It can help your app find web context, discover supporting sources, and enrich paper recommendations.

Suggested capabilities
Accept a research question and a collection of seed papers.
Retrieve and rank candidate publications.
Show useful metadata and source links for each result.
Explain why a paper is relevant to the question or seed collection.
Optionally offer graphs, clusters, filters, or other ways to explore the results.
Deliverable
Deploy a working app on Nebius. Return a ranked list of newly discovered papers with useful metadata, source links, and relevance explanations. Host the app interface and backend separately from the model endpoint.

There is no required algorithm, framework, or interface. Build the experience that best helps a researcher discover and evaluate relevant work.

Start with a Jupyter Notebook attached below. Explore the topic and generate ideas:

research-paper-discovery.ipynb