const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Script para automatizar a busca no site da Worten utilizando dados do products.json
 */
async function runScraperSearch() {
    // Caminho absoluto para o seu arquivo de dados
    const productsFilePath = 'c:\\Users\\rs250\\OneDrive\\Desktop\\iphone-vendas\\server\\data\\products.json';
    
    // Lendo e convertendo o JSON para objeto
    const productsData = JSON.parse(fs.readFileSync(productsFilePath, 'utf8'));

    const browser = await puppeteer.launch({ 
        headless: false, // Deixamos visível para você acompanhar a correção
        args: ['--start-maximized'] 
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    // Acessando a URL base da Worten informada
    await page.goto('https://www.worten.com.br/telemoveis-e-pacotes-tv/telemoveis-e-smartphones/iphone', { waitUntil: 'networkidle2' });

    // 1. Lidar com Cookies (essencial para que o input de busca fique interativo)
    try {
        const cookieBtn = '#onetrust-accept-btn-handler';
        await page.waitForSelector(cookieBtn, { timeout: 5000 });
        await page.click(cookieBtn);
    } catch (e) {
        console.log("Aviso: Banner de cookies não detectado ou já aceito.");
    }

    // Seletor da barra de pesquisa da Worten
    const SEARCH_INPUT = 'input[data-testid="search-input"]';

    for (const product of productsData) {
        // Limpeza do termo de busca: Se o nome já contém modelo/cor, não repetimos
        let searchTerm = product.name;
        if (product.model && !searchTerm.includes(product.model)) searchTerm += ` ${product.model}`;
        
        console.log(`Iniciando busca para: ${searchTerm}`);

        await page.waitForSelector(SEARCH_INPUT);
        
        // Limpeza robusta do campo de busca
        await page.focus(SEARCH_INPUT);
        await page.click(SEARCH_INPUT, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        
        // Digita com um pequeno atraso para simular comportamento humano e evitar bloqueios
        await page.type(SEARCH_INPUT, searchTerm, { delay: 50 });
        
        // Envia a busca e aguarda o seletor de produtos (mais seguro que waitForNavigation)
        await Promise.all([
            page.keyboard.press('Enter'),
            // Aguarda o container de resultados aparecer ou o feedback de "não encontrado"
            page.waitForSelector('.w-product__content, .w-search-no-results', { timeout: 10000 })
        ]);

        
        console.log(`Resultados carregados para: ${product.name}`);
        // Aqui você pode inserir a lógica para capturar os novos preços/estoque
    }

    console.log("Processo de busca finalizado.");
    await browser.close();
}

runScraperSearch().catch(err => console.error("Erro na execução do buscador:", err));
