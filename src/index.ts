import fs from "fs";
import typia from "typia";
import got from "got";
import {CookieJar} from "tough-cookie";
import * as cheerio from "cheerio";
import {DateTime} from "luxon";
import {FileCookieStore} from "tough-cookie-file-store";

interface Config {
    username: string;
    password: string;
    target_year: number;
    target_month: number;
    slug: string;
    category: string[];
    need_login: boolean;
}

interface Article {
    title: string;
    url: string;
    author: string;
    date: DateTime;
    view: number;
    rate: number;
    category: string;
}

interface Result {
    title: string;
    total: number;
    all: Article[];
    ten: Article[];
    twenty: Article[];
    thirty: Article[];
    forty: Article[];
    fifty: Article[];
    sixty: Article[];
    seventy: Article[];
    eighty: Article[];
    ninety: Article[];
    hundred: Article[];
    high: Article[];
}

const translate: Record<string, string> = {
    ten: "0~19",
    twenty: "20~29",
    thirty: "30~39",
    forty: "40~49",
    fifty: "50~59",
    sixty: "60~69",
    seventy: "70~79",
    eighty: "80~89",
    ninety: "90~99",
    hundred: "100~199",
    high: "200~"
};

if (!fs.existsSync("config.json")) {
    console.error("config.json 파일이 잘못되었습니다.");
    process.exit();
}

const config = JSON.parse(fs.readFileSync("config.json", "utf8"));

if (!typia.is<Config>(config)) {
    console.error("config.json 파일이 잘못되었습니다.");
    process.exit();
}

const cookieJar = new CookieJar(new FileCookieStore("cookies.json"));

const client = got.extend({
    prefixUrl: "https://arca.live",
    cookieJar,
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0",
        Origin: "https://arca.live"
    }
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const login = async (username: string, password: string) => {
    console.log(`[login]: ${username} 유저 로그인 중...`);

    const response = await client("u/login");
    const $ = cheerio.load(response.body);
    const _csrf = $("input[name=_csrf]").val() as string;

    await client("u/login", {
        method: "POST",
        followRedirect: false,
        form: {
            _csrf,
            from: "login",
            username,
            password
        }
    });

    console.log(`[login]: ${username} 유저 로그인 완료`);
};

const getArticles = async (category: string, page?: number): Promise<Article[]> => {
    await sleep(5000);

    page = page ?? 1;

    console.log(`[getArticles]: ${category} 카테고리 ${page} 페이지 글 가져오는 중...`);

    const response = await client(`b/${config.slug}?category=${category}&p=${page}`);
    const $ = cheerio.load(response.body);

    const result: Article[] = [];

    let end = false;

    for (const element of $(`a[class="vrow column"]`)) {
        const $element = cheerio.load(element);

        const date = DateTime.fromISO($element("time").attr("datetime")!, {zone: "Asia/Seoul"});

        if (date.year < config.target_year) {
            end = true;
            break;
        }

        if (date.year === config.target_year && date.month < config.target_month) {
            end = true;
            break;
        }

        if (date.year > config.target_year) {
            continue;
        }

        if (date.year === config.target_year && date.month !== config.target_month) {
            continue;
        }

        const title = $element(".title").text()!;
        const url = element.attribs.href;
        const author = $element(".user-info > span").attr("data-filter")!;
        const view = Number($element(".col-view").text());
        const rate = Number($element(".col-rate").text());
        const category = $(".item > a[class=active]").text().trim();

        result.push({
            title,
            url,
            author,
            date,
            view,
            rate,
            category
        });
    }

    console.log(`[getArticles]: ${category} 카테고리 ${page} 페이지 글 가져오기 완료`);

    return end ? result : result.concat(await getArticles(category, page + 1));
};

const resultArticles = (articles: Article[]): Result => {
    console.log(`[resultArticles]: 결과 결산 중...`);

    const result: Result = {
        title: `${config.target_year}년 ${config.target_month}월 채널 결산`,
        total: articles.length,
        all: articles,
        ten: [],
        twenty: [],
        thirty: [],
        forty: [],
        fifty: [],
        sixty: [],
        seventy: [],
        eighty: [],
        ninety: [],
        hundred: [],
        high: []
    };

    for (const article of articles) {
        // TODO 성능 좋은 for 써보기
        if (article.rate <= 19) {
            result.ten.push(article);
        } else if (article.rate >= 20 && article.rate <= 29) {
            result.twenty.push(article);
        } else if (article.rate >= 30 && article.rate <= 39) {
            result.thirty.push(article);
        } else if (article.rate >= 40 && article.rate <= 49) {
            result.forty.push(article);
        } else if (article.rate >= 50 && article.rate <= 59) {
            result.fifty.push(article);
        } else if (article.rate >= 60 && article.rate <= 69) {
            result.sixty.push(article);
        } else if (article.rate >= 70 && article.rate <= 79) {
            result.seventy.push(article);
        } else if (article.rate >= 80 && article.rate <= 89) {
            result.eighty.push(article);
        } else if (article.rate >= 90 && article.rate <= 99) {
            result.ninety.push(article);
        } else if (article.rate >= 100 && article.rate <= 199) {
            result.hundred.push(article);
        } else {
            result.high.push(article);
        }
    }

    for (const [, value] of Object.entries(result)) {
        if (!Array.isArray(value)) continue;
        (value as Article[]).sort((article, oldArticle) => article.rate - oldArticle.rate);
    }

    console.log(`[resultArticles]: 결과 결산 완료`);

    return result;
};

const makeHtml = (result: Result) => {
    console.log(`[makeHtml]: HTML 생성 중...`);

    let template = `<p><span style=font-size:24px>${result.title}</span></p><p>집계일: ${DateTime.now().setZone("Asia/Seoul").toFormat("yyyy-MM-dd a hh:mm:ss", {locale: "ko-KR"})}<p><br></p>`;

    template += `<table style=width:91%;margin-right:calc(9%)><thead><tr><th class=fr-highlighted colspan=11 style=width:100%;text-align:center>분류된 수 (${result.total}개)<br></thead><tbody><tr>`;

    for (const value of Object.values(translate)) {
        template += `<td style=width:9.3103%;text-align:center class="fr-highlighted fr-thick">${value}</td>`;
    }

    template += "</tr><tr>";

    for (const [key, value] of Object.entries(result)) {
        if (key === "all" || !Array.isArray(value)) continue;
        template += `<td style=width:9.3103%;text-align:center class="fr-highlighted fr-thick">${value.length} (${Math.floor((value.length / result.total) * 100)}%)</td>`;
    }

    template += "</tr></tbody></table>";
    template += `<p><br></p><p><br></p>`;

    for (const [key, value] of Object.entries(result)) {
        if (!Array.isArray(value)) continue;

        // TODO 임시
        if (key === "all" || key === "ten" || key === "twenty" || key === "thirty" || key === "forty") continue;

        template += `<details><summary>[${translate[key]}]</summary>`;
        template += "<div>";

        let article: Article;

        for (article of value) {
            const [username, tag] = article.author.split("#");
            const authorUrl = `/u/@${username}${tag ? `/${tag}` : ""}`;

            template += `<p>${article.title}</p>`;
            template += `<p>작성자: ${/\d{1,3}\.\d{1,3}$/.test(username) ? article.author : `<a href="${authorUrl}" target="_blank">${article.author}</a>`}, 작성일: ${article.date.toFormat("yyyy-MM-dd a hh:mm:ss", {locale: "ko-KR"})}, 조회수: ${article.view}, 추천: ${article.rate}, 카테고리: ${article.category}</p>`;
            template += `<p><a href="${article.url}" target="_blank">https://arca.live${article.url.replace(/\?.*$/g, "")}</a></p>`;
            template += "<p><br></p>";
        }

        template += "</div>";
        template += "</details>";
    }

    template += "</details>";

    console.log(`[makeHtml]: HTML 생성 완료`);

    return template;
};

if (config.need_login) {
    await login(config.username, config.password);
}

const articles: Article[] = [];

for (const category of config.category) {
    articles.push(...await getArticles(category));
}

const result = resultArticles(articles);

fs.writeFileSync("output.html", makeHtml(result), "utf8");

// await client("u/logout");